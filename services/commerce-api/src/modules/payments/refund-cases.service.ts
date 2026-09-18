import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  RefundCaseSource,
  RefundCaseStatus,
  RefundStatus,
  ReturnStatus,
  type Prisma,
  type Refund,
  type RefundCase,
  type RefundCaseItem,
  type RefundEvent,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { LedgerService } from '../financials/ledger.service';
import { OrdersService } from '../orders/orders.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type ProviderRefundResult,
} from './payment-provider';

export interface CreateRefundCaseItemInput {
  orderItemId: string;
  returnItemId?: string;
  quantity: number;
  amount: number;
  currency: string;
}

export interface CreateRefundCaseInput {
  sellerOrderId: string;
  source: RefundCaseSource;
  returnRequestId?: string;
  amount: number;
  shippingAmount?: number;
  currency: string;
  reason: string;
  idempotencyKey: string;
  items?: CreateRefundCaseItemInput[];
}

// Statuses treated as a definitive provider rejection rather than an
// ambiguous outcome needing reconciliation. 503 is included alongside the
// usual 4xx/501 set because the only provider wired up today
// (PendingPaymentProvider) throws ServiceUnavailableException for every
// call — the spec requires that "unsupported gateway" case to resolve as a
// clean, retryable REFUND_FAILED rather than sit in limbo.
const DEFINITIVE_REJECTION_STATUSES = [400, 404, 422, 501, 503];

type RefundCaseDetail = RefundCase & {
  items: RefundCaseItem[];
  refunds: Refund[];
  events: RefundEvent[];
};

@Injectable()
export class RefundCasesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ordersService: OrdersService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Creates the RefundCase obligation and attempts the provider refund once.
   * Never throws for a provider-side outcome (rejection or ambiguity) — only
   * for a validation failure (bad amount, unpaid/unverified payment,
   * insufficient refundable balance, idempotency conflict) — so a caller
   * fanning this out across several seller orders (a multi-seller return)
   * can keep creating the remaining cases even after one attempt fails.
   */
  async createCase(input: CreateRefundCaseInput): Promise<RefundCase> {
    const prepared = await this.prisma.$transaction((tx) =>
      this.prepareCase(input, tx),
    );
    if (!prepared.created) {
      return prepared.refundCase.status === RefundCaseStatus.PENDING
        ? this.processPending(prepared.refundCase.id)
        : prepared.refundCase;
    }
    return this.processPending(prepared.refundCase.id);
  }

  /** Persist an obligation inside the caller's transaction without contacting the provider. */
  async prepareCase(
    input: CreateRefundCaseInput,
    tx: Prisma.TransactionClient,
  ): Promise<{ refundCase: RefundCase; created: boolean }> {
    const shippingAmount = input.shippingAmount ?? 0;
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
      throw new ConflictException('Refund amount must be positive minor units');
    if (
      !Number.isSafeInteger(shippingAmount) ||
      shippingAmount < 0 ||
      shippingAmount > input.amount
    )
      throw new ConflictException(
        'Shipping refund amount must be between 0 and the total refund amount',
      );

    const initial = await this.ordersService.getSellerOrderForPayment(
      input.sellerOrderId,
      tx,
    );
    await this.ordersService.lockForPayment(initial.orderId, tx);

    const existing = await tx.refundCase.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { items: true },
    });
    if (existing) {
      if (
        existing.sellerOrderId !== input.sellerOrderId ||
        existing.amount !== input.amount ||
        existing.shippingAmount !== shippingAmount ||
        existing.currency !== input.currency ||
        existing.reason !== input.reason ||
        existing.source !== input.source ||
        (existing.returnRequestId ?? null) !== (input.returnRequestId ?? null)
      )
        throw new ConflictException(
          'Idempotency key already belongs to a different refund case',
        );
      const expectedItems = [...(input.items ?? [])]
        .map((item) => ({
          orderItemId: item.orderItemId,
          returnItemId: item.returnItemId ?? null,
          quantity: item.quantity,
          amount: item.amount,
          currency: item.currency,
        }))
        .sort((a, b) => a.orderItemId.localeCompare(b.orderItemId));
      const actualItems = existing.items
        .map((item) => ({
          orderItemId: item.orderItemId,
          returnItemId: item.returnItemId,
          quantity: item.quantity,
          amount: item.amount,
          currency: item.currency,
        }))
        .sort((a, b) => a.orderItemId.localeCompare(b.orderItemId));
      if (JSON.stringify(actualItems) !== JSON.stringify(expectedItems))
        throw new ConflictException(
          'Idempotency key already belongs to a different refund case',
        );
      return { refundCase: existing, created: false };
    }

    const sellerOrder = await this.ordersService.getSellerOrderForPayment(
      input.sellerOrderId,
      tx,
    );
    const payment = await tx.payment.findUnique({
      where: { orderId: sellerOrder.orderId },
    });
    if (!payment)
      throw new NotFoundException('Payment not found for this order');
    if (payment.provider !== this.provider.name || !payment.providerReference)
      throw new ConflictException(
        'Payment provider or reference is unavailable',
      );
    if (
      !['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status) ||
      !['PAID', 'PARTIALLY_REFUNDED'].includes(sellerOrder.status) ||
      payment.currency !== sellerOrder.currency ||
      payment.currency !== input.currency
    )
      throw new ConflictException(
        'Only a confirmed payment and paid seller order can be refunded',
      );

    const pendingCases = await tx.refundCase.findMany({
      where: {
        status: {
          in: [
            RefundCaseStatus.PENDING,
            RefundCaseStatus.PROCESSING,
            RefundCaseStatus.RECONCILIATION_REQUIRED,
          ],
        },
      },
      include: { sellerOrder: { select: { orderId: true } } },
    });
    const paymentHeld = pendingCases
      .filter((c) => c.sellerOrder.orderId === sellerOrder.orderId)
      .reduce((sum, c) => sum + c.amount, 0);
    const sellerHeld = pendingCases
      .filter((c) => c.sellerOrderId === input.sellerOrderId)
      .reduce((sum, c) => sum + c.amount, 0);
    if (
      input.amount > payment.amount - payment.refundedAmount - paymentHeld ||
      input.amount > sellerOrder.total - sellerOrder.refundedAmount - sellerHeld
    )
      throw new ConflictException(
        'Refund amount exceeds the remaining refundable balance, including pending refunds',
      );

    if (shippingAmount > 0) {
      const priorShippingCases = await tx.refundCase.findMany({
        where: {
          sellerOrderId: input.sellerOrderId,
          status: {
            notIn: [RefundCaseStatus.FAILED, RefundCaseStatus.CANCELLED],
          },
        },
        select: { shippingAmount: true },
      });
      const shippingRefunded = priorShippingCases.reduce(
        (sum, c) => sum + c.shippingAmount,
        0,
      );
      if (shippingAmount > sellerOrder.shippingAmount - shippingRefunded)
        throw new ConflictException(
          "Shipping refund amount exceeds the seller order's remaining refundable shipping",
        );
    }

    const refundCase = await tx.refundCase.create({
      data: {
        sellerOrderId: input.sellerOrderId,
        source: input.source,
        returnRequestId: input.returnRequestId,
        status: RefundCaseStatus.PENDING,
        amount: input.amount,
        shippingAmount,
        currency: input.currency,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        items: input.items?.length
          ? {
              create: input.items.map((item) => ({
                orderItemId: item.orderItemId,
                returnItemId: item.returnItemId,
                quantity: item.quantity,
                amount: item.amount,
                currency: item.currency,
              })),
            }
          : undefined,
      },
    });
    await this.recordEvent(tx, refundCase.id, 'CASE_CREATED', {
      amount: input.amount,
      shippingAmount,
      source: input.source,
    });
    return { refundCase, created: true };
  }

  /** Contact the provider only after the obligation transaction has committed. */
  async processPending(refundCaseId: string): Promise<RefundCase> {
    const refundCase = await this.prisma.refundCase.findUnique({
      where: { id: refundCaseId },
    });
    if (!refundCase) throw new NotFoundException('Refund case not found');
    if (refundCase.status !== RefundCaseStatus.PENDING) return refundCase;
    const sellerOrder = await this.ordersService.getSellerOrderForPayment(
      refundCase.sellerOrderId,
    );
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { orderId: sellerOrder.orderId },
    });
    if (!payment.providerReference)
      throw new ConflictException('Payment provider reference is unavailable');
    const attempts = await this.prisma.refund.count({
      where: { refundCaseId },
    });
    return this.attempt(
      refundCase,
      payment.id,
      payment.providerReference,
      attempts + 1,
    );
  }

  /** Only valid from FAILED — RECONCILIATION_REQUIRED must be reconciled first. */
  async retry(refundCaseId: string): Promise<RefundCase> {
    const refundCase = await this.prisma.refundCase.findUnique({
      where: { id: refundCaseId },
    });
    if (!refundCase) throw new NotFoundException('Refund case not found');
    if (refundCase.status !== RefundCaseStatus.FAILED)
      throw new ConflictException(
        `Cannot retry a refund case with status ${refundCase.status}`,
      );
    const sellerOrder = await this.ordersService.getSellerOrderForPayment(
      refundCase.sellerOrderId,
    );
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { orderId: sellerOrder.orderId },
    });
    const attempts = await this.prisma.refund.count({
      where: { refundCaseId },
    });
    return this.attempt(
      refundCase,
      payment.id,
      payment.providerReference!,
      attempts + 1,
    );
  }

  /** Re-asks the provider about the case's latest PENDING/PROCESSING attempt. */
  async reconcile(refundCaseId: string): Promise<RefundCase> {
    const refundCase = await this.prisma.refundCase.findUnique({
      where: { id: refundCaseId },
    });
    if (!refundCase) throw new NotFoundException('Refund case not found');
    const attempt = await this.prisma.refund.findFirst({
      where: {
        refundCaseId,
        status: { in: [RefundStatus.PENDING, RefundStatus.PROCESSING] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!attempt || !attempt.providerReference) return refundCase;
    const result = await this.safeGetRefund(attempt.providerReference);
    return this.applyOutcome(refundCase.id, attempt.id, result);
  }

  async findById(refundCaseId: string): Promise<RefundCaseDetail> {
    const refundCase = await this.prisma.refundCase.findUnique({
      where: { id: refundCaseId },
      include: { items: true, refunds: true, events: true },
    });
    if (!refundCase) throw new NotFoundException('Refund case not found');
    return refundCase;
  }

  listForSellerOrder(sellerOrderId: string): Promise<RefundCase[]> {
    return this.prisma.refundCase.findMany({
      where: { sellerOrderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async attempt(
    refundCase: RefundCase,
    paymentId: string,
    providerReference: string,
    attemptNumber: number,
  ): Promise<RefundCase> {
    const attemptIdempotencyKey = `${refundCase.idempotencyKey}:attempt:${attemptNumber}`;
    let refund: Refund;
    try {
      refund = await this.prisma.refund.create({
        data: {
          paymentId,
          sellerOrderId: refundCase.sellerOrderId,
          refundCaseId: refundCase.id,
          amount: refundCase.amount,
          currency: refundCase.currency,
          reason: refundCase.reason,
          status: RefundStatus.PENDING,
          idempotencyKey: attemptIdempotencyKey,
        },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'P2002'
      )
        return this.prisma.refundCase.findUniqueOrThrow({
          where: { id: refundCase.id },
        });
      throw error;
    }
    await this.transitionCase(refundCase.id, RefundCaseStatus.PROCESSING);
    await this.recordEvent(this.prisma, refundCase.id, 'ATTEMPT_STARTED', {
      refundId: refund.id,
      attemptNumber,
    });

    let result: ProviderRefundResult;
    try {
      result = await this.provider.refund(
        providerReference,
        refundCase.amount,
        refundCase.reason,
        attemptIdempotencyKey,
      );
    } catch (error) {
      const rejected =
        error instanceof HttpException &&
        DEFINITIVE_REJECTION_STATUSES.includes(error.getStatus());
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: rejected ? RefundStatus.FAILED : RefundStatus.PENDING,
          failureReason: rejected
            ? 'Provider rejected this refund operation'
            : 'Refund outcome requires reconciliation',
        },
      });
      const caseStatus = rejected
        ? RefundCaseStatus.FAILED
        : RefundCaseStatus.RECONCILIATION_REQUIRED;
      await this.transitionCase(refundCase.id, caseStatus);
      await this.recordEvent(
        this.prisma,
        refundCase.id,
        rejected ? 'ATTEMPT_REJECTED' : 'ATTEMPT_AMBIGUOUS',
        { refundId: refund.id, message: (error as Error).message },
      );
      return this.prisma.refundCase.findUniqueOrThrow({
        where: { id: refundCase.id },
      });
    }

    await this.prisma.refund.update({
      where: { id: refund.id },
      data: { providerReference: result.providerReference },
    });
    return this.applyOutcome(refundCase.id, refund.id, result);
  }

  private async applyOutcome(
    refundCaseId: string,
    refundId: string,
    result: ProviderRefundResult,
  ): Promise<RefundCase> {
    if (
      !['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].includes(
        result.status,
      ) ||
      !result.providerReference
    ) {
      await this.recordEvent(this.prisma, refundCaseId, 'ATTEMPT_AMBIGUOUS', {
        refundId,
        result,
      });
      await this.transitionCase(
        refundCaseId,
        RefundCaseStatus.RECONCILIATION_REQUIRED,
      );
      return this.prisma.refundCase.findUniqueOrThrow({
        where: { id: refundCaseId },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const refundCase = await tx.refundCase.findUniqueOrThrow({
        where: { id: refundCaseId },
      });
      // Lock before the status check, not after: two concurrent outcomes for
      // the same attempt (e.g. two racing reconcile calls) must serialize
      // here so the second one re-reads a status the first one already
      // resolved, instead of both acting on the same stale "still pending"
      // snapshot taken before either held the lock.
      await this.ordersService.lockForPayment(
        (
          await this.ordersService.getSellerOrderForPayment(
            refundCase.sellerOrderId,
            tx,
          )
        ).orderId,
        tx,
      );
      const refund = await tx.refund.findUniqueOrThrow({
        where: { id: refundId },
      });
      if (
        !(
          [RefundStatus.PENDING, RefundStatus.PROCESSING] as RefundStatus[]
        ).includes(refund.status)
      )
        return refundCase;

      if (result.status === 'SUCCEEDED') {
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: refund.paymentId },
        });
        const sellerOrder = await this.ordersService.getSellerOrderForPayment(
          refundCase.sellerOrderId,
          tx,
        );
        const refundedAmount = payment.refundedAmount + refund.amount;
        if (refundedAmount > payment.amount)
          throw new ConflictException(
            'Payment refund total requires reconciliation',
          );
        await this.ordersService.applyRefund(
          refundCase.sellerOrderId,
          refund.amount,
          tx,
        );
        await this.ledgerService.recordRefundReversal(
          sellerOrder,
          refund.amount,
          refund.id,
          tx,
        );
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            refundedAmount,
            status:
              refundedAmount === payment.amount
                ? 'REFUNDED'
                : 'PARTIALLY_REFUNDED',
          },
        });
      }

      await tx.refund.update({
        where: { id: refund.id },
        data: {
          status: result.status,
          providerReference: result.providerReference,
          failureReason: null,
        },
      });

      const nextCaseStatus =
        result.status === 'SUCCEEDED'
          ? RefundCaseStatus.SUCCEEDED
          : result.status === 'FAILED' || result.status === 'CANCELLED'
            ? RefundCaseStatus.FAILED
            : RefundCaseStatus.PROCESSING;
      const updated = await tx.refundCase.update({
        where: { id: refundCaseId, version: refundCase.version },
        data: { status: nextCaseStatus, version: { increment: 1 } },
      });
      await this.recordEvent(tx, refundCaseId, 'ATTEMPT_RESOLVED', {
        refundId: refund.id,
        status: result.status,
      });
      await this.projectReturnStatus(tx, updated.returnRequestId);
      return updated;
    });
  }

  private async safeGetRefund(
    providerReference: string,
  ): Promise<ProviderRefundResult> {
    try {
      return await this.provider.getRefund(providerReference);
    } catch {
      return { providerReference, status: 'PENDING' };
    }
  }

  private async transitionCase(
    refundCaseId: string,
    status: RefundCaseStatus,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.refundCase.update({
        where: { id: refundCaseId },
        data: { status, version: { increment: 1 } },
      });
      await this.projectReturnStatus(tx, updated.returnRequestId);
    });
  }

  private async projectReturnStatus(
    tx: Prisma.TransactionClient,
    returnRequestId: string | null,
  ): Promise<void> {
    if (!returnRequestId) return;
    const cases = await tx.refundCase.findMany({
      where: { returnRequestId },
      select: { status: true },
    });
    if (cases.length === 0) return;
    const statuses = cases.map((entry) => entry.status);
    const succeeded = statuses.filter(
      (status) => status === RefundCaseStatus.SUCCEEDED,
    ).length;
    const next =
      succeeded === statuses.length
        ? ReturnStatus.REFUNDED
        : succeeded > 0
          ? ReturnStatus.PARTIALLY_REFUNDED
          : statuses.some((status) =>
                (
                  [
                    RefundCaseStatus.FAILED,
                    RefundCaseStatus.RECONCILIATION_REQUIRED,
                  ] as RefundCaseStatus[]
                ).includes(status),
              )
            ? ReturnStatus.REFUND_FAILED
            : ReturnStatus.REFUND_PENDING;
    const current = await tx.returnRequest.findUnique({
      where: { id: returnRequestId },
      select: { status: true },
    });
    if (!current || current.status === next) return;
    await tx.returnRequest.update({
      where: { id: returnRequestId },
      data: { status: next, version: { increment: 1 } },
    });
    await tx.returnEvent.create({
      data: {
        returnRequestId,
        type: 'REFUND_STATUS_PROJECTED',
        data: { from: current.status, to: next },
      },
    });
  }

  private recordEvent(
    client: Pick<Prisma.TransactionClient, 'refundEvent'> | PrismaService,
    refundCaseId: string,
    type: string,
    data: unknown,
  ): Promise<RefundEvent> {
    return client.refundEvent.create({
      data: { refundCaseId, type, data: data as Prisma.InputJsonValue },
    });
  }
}
