import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  LedgerEntryType,
  PayoutAccountMethod,
  PayoutAccountStatus,
  PayoutAttemptStatus,
  PayoutBatchStatus,
  Prisma,
  SellerPayoutStatus,
  type SellerPayoutRequest,
} from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { AuditService } from '../../audit/audit.service';
import { SellersService } from '../../sellers/sellers.service';
import {
  CancelPayoutRequestDto,
  CreatePayoutRequestDto,
  ListPayoutRequestsDto,
  PayoutResolutionOutcome,
  ResolvePayoutRequestDto,
  ReviewPayoutRequestDto,
} from '../dto/payout-request.dto';
import {
  PayoutAccountVersionDto,
  SavePayoutAccountDto,
  UpdatePayoutAccountDto,
  VerifyPayoutAccountDto,
} from '../dto/payout-account.dto';
import { LedgerService } from '../ledger.service';
import { PAYOUT_PROVIDER } from './payout-provider';
import type { PayoutProvider } from './payout-provider';

const ACCOUNT_PUBLIC_SELECT = {
  id: true,
  sellerId: true,
  method: true,
  provider: true,
  accountHolderName: true,
  maskedReference: true,
  status: true,
  verificationNote: true,
  verifiedByUserId: true,
  verifiedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SellerPayoutAccountSelect;

const REQUEST_INCLUDE = {
  payoutAccount: { select: ACCOUNT_PUBLIC_SELECT },
  attempts: {
    select: {
      id: true,
      attemptNumber: true,
      provider: true,
      status: true,
      providerReference: true,
      failureReason: true,
      startedAt: true,
      completedAt: true,
    },
    orderBy: { attemptNumber: 'asc' as const },
  },
  events: {
    select: {
      id: true,
      action: true,
      fromStatus: true,
      toStatus: true,
      actorUserId: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.SellerPayoutRequestInclude;

export type PayoutAccountView = Prisma.SellerPayoutAccountGetPayload<{
  select: typeof ACCOUNT_PUBLIC_SELECT;
}>;
export type AdminPayoutAccountView = {
  id: string;
  sellerId: string;
  method: PayoutAccountMethod;
  provider: string;
  accountHolderName: string;
  destination: Record<string, unknown>;
  maskedReference: string;
  status: PayoutAccountStatus;
  verificationNote: string | null;
  verifiedByUserId: string | null;
  verifiedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
export type PayoutRequestView = Omit<
  Prisma.SellerPayoutRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>,
  'destinationSnapshot' | 'requestHash'
>;
export type PayoutRequestPage = {
  items: PayoutRequestView[];
  total: number;
  page: number;
  limit: number;
};
export type PayoutBatchView = {
  id: string;
  status: PayoutBatchStatus;
  requestCount: number;
  totalAmount: number;
  currency: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type PayoutBatchPage = {
  items: PayoutBatchView[];
  total: number;
  page: number;
  limit: number;
};
export type PayoutBatchDetail = PayoutBatchView & {
  requests: PayoutRequestView[];
};

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sellers: SellersService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    @Inject(PAYOUT_PROVIDER) private readonly provider: PayoutProvider,
  ) {}

  async createAccount(
    ownerUserId: string,
    dto: SavePayoutAccountDto,
  ): Promise<PayoutAccountView> {
    const seller = await this.sellers.requireApproved(ownerUserId);
    const destination = this.validateDestination(dto.destination);
    const account = await this.prisma.sellerPayoutAccount.create({
      data: {
        sellerId: seller.id,
        method: dto.method,
        provider: dto.provider.trim(),
        accountHolderName: dto.accountHolderName.trim(),
        destination,
        maskedReference: this.maskDestination(destination),
      },
      select: ACCOUNT_PUBLIC_SELECT,
    });
    await this.audit.record({
      actorUserId: ownerUserId,
      action: 'payout_account.created',
      targetType: 'seller_payout_account',
      targetId: account.id,
      metadata: {
        sellerId: seller.id,
        method: account.method,
        provider: account.provider,
      },
    });
    return account;
  }

  async updateAccount(
    ownerUserId: string,
    id: string,
    dto: UpdatePayoutAccountDto,
  ): Promise<PayoutAccountView> {
    const seller = await this.sellers.requireApproved(ownerUserId);
    const destination = this.validateDestination(dto.destination);
    const changed = await this.prisma.sellerPayoutAccount.updateMany({
      where: { id, sellerId: seller.id, version: dto.version },
      data: {
        method: dto.method,
        provider: dto.provider.trim(),
        accountHolderName: dto.accountHolderName.trim(),
        destination,
        maskedReference: this.maskDestination(destination),
        status: PayoutAccountStatus.PENDING_VERIFICATION,
        verificationNote: null,
        verifiedAt: null,
        verifiedByUserId: null,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) await this.throwAccountConflict(id, seller.id);
    return this.prisma.sellerPayoutAccount.findUniqueOrThrow({
      where: { id },
      select: ACCOUNT_PUBLIC_SELECT,
    });
  }

  async disableAccount(
    ownerUserId: string,
    id: string,
    dto: PayoutAccountVersionDto,
  ): Promise<PayoutAccountView> {
    const seller = await this.sellers.requireApproved(ownerUserId);
    const changed = await this.prisma.sellerPayoutAccount.updateMany({
      where: {
        id,
        sellerId: seller.id,
        version: dto.version,
        status: { not: PayoutAccountStatus.DISABLED },
      },
      data: { status: PayoutAccountStatus.DISABLED, version: { increment: 1 } },
    });
    if (changed.count !== 1) await this.throwAccountConflict(id, seller.id);
    return this.prisma.sellerPayoutAccount.findUniqueOrThrow({
      where: { id },
      select: ACCOUNT_PUBLIC_SELECT,
    });
  }

  async listOwnAccounts(ownerUserId: string): Promise<PayoutAccountView[]> {
    const seller = await this.sellers.requireApproved(ownerUserId);
    return this.prisma.sellerPayoutAccount.findMany({
      where: { sellerId: seller.id },
      select: ACCOUNT_PUBLIC_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async listAccounts(sellerId?: string): Promise<PayoutAccountView[]> {
    return this.prisma.sellerPayoutAccount.findMany({
      where: { sellerId },
      select: ACCOUNT_PUBLIC_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async findAccountForAdmin(
    id: string,
    actorUserId: string,
  ): Promise<AdminPayoutAccountView> {
    const account = await this.prisma.sellerPayoutAccount.findUnique({
      where: { id },
    });
    if (!account) throw new NotFoundException('Payout account not found');
    await this.audit.record({
      actorUserId,
      action: 'payout_account.destination_viewed',
      targetType: 'seller_payout_account',
      targetId: id,
    });
    return account as AdminPayoutAccountView;
  }

  async verifyAccount(
    id: string,
    dto: VerifyPayoutAccountDto,
    actorUserId: string,
  ): Promise<PayoutAccountView> {
    if (
      dto.status !== PayoutAccountStatus.VERIFIED &&
      dto.status !== PayoutAccountStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Account verification must verify or reject',
      );
    }
    const changed = await this.prisma.sellerPayoutAccount.updateMany({
      where: {
        id,
        version: dto.version,
        status: PayoutAccountStatus.PENDING_VERIFICATION,
      },
      data: {
        status: dto.status,
        verificationNote: dto.note.trim(),
        verifiedByUserId: actorUserId,
        verifiedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) {
      const exists = await this.prisma.sellerPayoutAccount.findUnique({
        where: { id },
      });
      if (!exists) throw new NotFoundException('Payout account not found');
      throw new ConflictException(
        'Payout account changed or is not awaiting verification',
      );
    }
    return this.prisma.sellerPayoutAccount.findUniqueOrThrow({
      where: { id },
      select: ACCOUNT_PUBLIC_SELECT,
    });
  }

  async createRequest(
    ownerUserId: string,
    dto: CreatePayoutRequestDto,
    idempotencyKey: string,
  ): Promise<PayoutRequestView> {
    const seller = await this.sellers.requireApproved(ownerUserId);
    await this.ledger.releaseMaturedFunds();
    const minimum = this.config.get<number>('SELLER_PAYOUT_MINIMUM_MINOR', 1);
    if (dto.amount < minimum) {
      throw new ConflictException(`Minimum payout is ${minimum} minor units`);
    }
    const requestHash = this.hash({ sellerId: seller.id, ...dto });

    const request = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT seller_id FROM seller_balances WHERE seller_id = ${seller.id}::uuid FOR UPDATE`;
      const replay = await tx.sellerPayoutRequest.findUnique({
        where: { idempotencyKey },
      });
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new ConflictException(
            'Idempotency key belongs to a different payout request',
          );
        }
        return replay;
      }
      const account = await tx.sellerPayoutAccount.findFirst({
        where: {
          id: dto.payoutAccountId,
          sellerId: seller.id,
          status: PayoutAccountStatus.VERIFIED,
        },
      });
      if (!account)
        throw new ConflictException('A verified payout account is required');
      const balance = await tx.sellerBalance.findUnique({
        where: { sellerId: seller.id },
      });
      if (!balance)
        throw new ConflictException('Seller has no payable balance');
      if (balance.currency !== 'ZMW')
        throw new ConflictException('Payouts require ZMW');
      const reserved = await tx.sellerBalance.updateMany({
        where: { sellerId: seller.id, balance: { gte: dto.amount } },
        data: {
          balance: { decrement: dto.amount },
          pendingPayoutBalance: { increment: dto.amount },
        },
      });
      if (reserved.count !== 1)
        throw new ConflictException('Payout exceeds available balance');
      const created = await tx.sellerPayoutRequest.create({
        data: {
          sellerId: seller.id,
          payoutAccountId: account.id,
          amount: dto.amount,
          currency: balance.currency,
          destinationSnapshot: account.destination as Prisma.InputJsonValue,
          idempotencyKey,
          requestHash,
        },
      });
      await tx.payoutRequestEvent.create({
        data: {
          payoutRequestId: created.id,
          action: 'REQUESTED',
          toStatus: SellerPayoutStatus.REQUESTED,
          actorUserId: ownerUserId,
          metadata: { amount: dto.amount, currency: balance.currency },
        },
      });
      return created;
    });
    return this.findRequest(request.id, seller.id);
  }

  async cancelOwnRequest(
    ownerUserId: string,
    id: string,
    dto: CancelPayoutRequestDto,
    idempotencyKey: string,
  ): Promise<PayoutRequestView> {
    const seller = await this.sellers.requireApproved(ownerUserId);
    await this.releaseRequest(
      id,
      seller.id,
      dto.version,
      SellerPayoutStatus.REQUESTED,
      SellerPayoutStatus.CANCELLED,
      'CANCELLED_BY_SELLER',
      dto.reason,
      ownerUserId,
      idempotencyKey,
    );
    return this.findRequest(id, seller.id);
  }

  async listOwnRequests(
    ownerUserId: string,
    query: ListPayoutRequestsDto,
  ): Promise<PayoutRequestPage> {
    const seller = await this.sellers.requireApproved(ownerUserId);
    return this.listRequests({ ...query, sellerId: seller.id });
  }

  async listRequests(query: ListPayoutRequestsDto): Promise<PayoutRequestPage> {
    const where = { sellerId: query.sellerId, status: query.status };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sellerPayoutRequest.findMany({
        where,
        include: REQUEST_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.sellerPayoutRequest.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.toRequestView(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  findOwnRequest(ownerUserId: string, id: string): Promise<PayoutRequestView> {
    return this.sellers
      .requireApproved(ownerUserId)
      .then((seller) => this.findRequest(id, seller.id));
  }

  findAdminRequest(id: string): Promise<PayoutRequestView> {
    return this.findRequest(id);
  }

  async approve(
    id: string,
    dto: ReviewPayoutRequestDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<PayoutRequestView> {
    await this.transition(
      id,
      dto.version,
      [SellerPayoutStatus.REQUESTED],
      SellerPayoutStatus.APPROVED,
      'APPROVED',
      actorUserId,
      idempotencyKey,
      { note: dto.reason ?? null },
      {
        reviewedByUserId: actorUserId,
        reviewedAt: new Date(),
        failureReason: null,
      },
    );
    return this.findRequest(id);
  }

  async reject(
    id: string,
    dto: ReviewPayoutRequestDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<PayoutRequestView> {
    if (!dto.reason?.trim())
      throw new BadRequestException('A rejection reason is required');
    const request = await this.findRawRequest(id);
    await this.releaseRequest(
      id,
      request.sellerId,
      dto.version,
      SellerPayoutStatus.REQUESTED,
      SellerPayoutStatus.CANCELLED,
      'REJECTED',
      dto.reason,
      actorUserId,
      idempotencyKey,
      { reviewedByUserId: actorUserId, reviewedAt: new Date() },
    );
    return this.findRequest(id);
  }

  async retry(
    id: string,
    dto: ReviewPayoutRequestDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<PayoutRequestView> {
    await this.transition(
      id,
      dto.version,
      [SellerPayoutStatus.FAILED],
      SellerPayoutStatus.APPROVED,
      'RETRY_APPROVED',
      actorUserId,
      idempotencyKey,
      { note: dto.reason ?? null },
      { failureReason: null, batchId: null },
    );
    return this.findRequest(id);
  }

  async resolve(
    id: string,
    dto: ResolvePayoutRequestDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<PayoutRequestView> {
    const request = await this.findRawRequest(id);
    if (
      request.status !== SellerPayoutStatus.RECONCILIATION_REQUIRED ||
      request.version !== dto.version
    ) {
      const replay = await this.isEventReplay(
        id,
        idempotencyKey,
        this.hash(dto),
      );
      if (!replay)
        throw new ConflictException(
          'Payout request changed or is not reconcilable',
        );
      return this.findRequest(id);
    }
    const attempt = await this.prisma.payoutAttempt.findFirst({
      where: { payoutRequestId: id },
      orderBy: { attemptNumber: 'desc' },
    });
    if (!attempt) throw new ConflictException('Payout has no provider attempt');
    if (dto.outcome === PayoutResolutionOutcome.SUCCEEDED) {
      await this.completeSuccess(
        request,
        attempt.id,
        dto.providerReference,
        actorUserId,
        idempotencyKey,
        this.hash(dto),
        dto.version,
      );
    } else {
      await this.completeFailure(
        request,
        attempt.id,
        dto.note ?? 'External payout failed during reconciliation',
        actorUserId,
        idempotencyKey,
        this.hash(dto),
        dto.version,
      );
    }
    return this.findRequest(id);
  }

  async createBatch(limit = 100): Promise<string | null> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new BadRequestException('Batch limit must be between 1 and 1000');
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM seller_payout_requests
        WHERE status = 'APPROVED' AND batch_id IS NULL
        ORDER BY created_at, id LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
      const requests = await tx.sellerPayoutRequest.findMany({
        where: { id: { in: claimed.map((row) => row.id) } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
      });
      if (requests.length === 0) return null;
      const batch = await tx.payoutBatch.create({
        data: {
          status: PayoutBatchStatus.PROCESSING,
          requestCount: requests.length,
          totalAmount: requests.reduce(
            (sum, request) => sum + request.amount,
            0,
          ),
          currency: requests[0]!.currency,
          startedAt: new Date(),
        },
      });
      const assigned = await tx.sellerPayoutRequest.updateMany({
        where: {
          id: { in: requests.map((request) => request.id) },
          status: SellerPayoutStatus.APPROVED,
          batchId: null,
        },
        data: { batchId: batch.id },
      });
      if (assigned.count !== requests.length)
        throw new ConflictException('Payout batch claim changed');
      return batch.id;
    });
  }

  async processBatch(batchId: string): Promise<void> {
    const requests = await this.prisma.sellerPayoutRequest.findMany({
      where: { batchId, status: SellerPayoutStatus.APPROVED },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    for (const request of requests) await this.processRequest(request.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payout_batches WHERE id = ${batchId}::uuid FOR UPDATE`;
      const pending = await tx.sellerPayoutRequest.count({
        where: {
          batchId,
          status: {
            in: [SellerPayoutStatus.APPROVED, SellerPayoutStatus.PROCESSING],
          },
        },
      });
      if (pending > 0) return;
      const errorCount = await tx.sellerPayoutRequest.count({
        where: {
          batchId,
          status: {
            in: [
              SellerPayoutStatus.FAILED,
              SellerPayoutStatus.RECONCILIATION_REQUIRED,
            ],
          },
        },
      });
      await tx.payoutBatch.update({
        where: { id: batchId },
        data: {
          status: errorCount
            ? PayoutBatchStatus.COMPLETED_WITH_ERRORS
            : PayoutBatchStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    });
  }

  async resumeBatches(): Promise<void> {
    const batches = await this.prisma.payoutBatch.findMany({
      where: {
        OR: [
          {
            status: {
              in: [PayoutBatchStatus.OPEN, PayoutBatchStatus.PROCESSING],
            },
          },
          {
            requests: {
              some: {
                status: {
                  in: [
                    SellerPayoutStatus.APPROVED,
                    SellerPayoutStatus.PROCESSING,
                  ],
                },
              },
            },
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { id: true },
    });
    for (const batch of batches) await this.processBatch(batch.id);
  }

  async listBatches(query: PaginationQueryDto): Promise<PayoutBatchPage> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payoutBatch.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.payoutBatch.count(),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async findBatch(id: string): Promise<PayoutBatchDetail> {
    const batch = await this.prisma.payoutBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException('Payout batch not found');
    const requests = await this.prisma.sellerPayoutRequest.findMany({
      where: { batchId: id },
      include: REQUEST_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return {
      ...batch,
      requests: requests.map((request) => this.toRequestView(request)),
    };
  }

  async processRequest(id: string): Promise<void> {
    const claimed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM seller_payout_requests WHERE id = ${id}::uuid FOR UPDATE`;
      const request = await tx.sellerPayoutRequest.findUnique({
        where: { id },
      });
      if (!request || request.status !== SellerPayoutStatus.APPROVED)
        return null;
      await tx.$queryRaw`SELECT id FROM sellers WHERE id = ${request.sellerId}::uuid FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM seller_payout_accounts WHERE id = ${request.payoutAccountId}::uuid FOR SHARE`;
      const seller = await tx.seller.findUnique({
        where: { id: request.sellerId },
      });
      const account = await tx.sellerPayoutAccount.findUnique({
        where: { id: request.payoutAccountId },
      });
      const eligible =
        seller?.status === 'APPROVED' &&
        account?.sellerId === request.sellerId &&
        account.status === PayoutAccountStatus.VERIFIED &&
        this.hash(account.destination) ===
          this.hash(request.destinationSnapshot);
      const attemptNumber =
        (await tx.payoutAttempt.count({ where: { payoutRequestId: id } })) + 1;
      const attempt = await tx.payoutAttempt.create({
        data: {
          payoutRequestId: id,
          attemptNumber,
          provider: this.provider.name,
          requestPayload: {
            amount: request.amount,
            currency: request.currency,
            destination: request.destinationSnapshot,
          },
        },
      });
      await tx.sellerPayoutRequest.update({
        where: { id },
        data: {
          status: SellerPayoutStatus.PROCESSING,
          version: { increment: 1 },
        },
      });
      await tx.payoutRequestEvent.create({
        data: {
          payoutRequestId: id,
          action: 'PROCESSING',
          fromStatus: SellerPayoutStatus.APPROVED,
          toStatus: SellerPayoutStatus.PROCESSING,
          metadata: { attemptId: attempt.id, provider: this.provider.name },
        },
      });
      return { request, attempt, eligible };
    });
    if (!claimed) return;

    if (!claimed.eligible) {
      await this.markUnknown(
        id,
        claimed.attempt.id,
        'Transfer not submitted: seller or payout destination requires review',
      );
      return;
    }

    try {
      const result = await this.provider.submit({
        requestId: id,
        attemptId: claimed.attempt.id,
        idempotencyKey: claimed.attempt.id,
        amount: claimed.request.amount,
        currency: claimed.request.currency,
        destination: claimed.request.destinationSnapshot,
      });
      if (result.outcome === 'SUCCEEDED') {
        await this.completeSuccess(
          claimed.request,
          claimed.attempt.id,
          result.providerReference ??
            `${this.provider.name}:${claimed.attempt.id}`,
          undefined,
          undefined,
          undefined,
          claimed.request.version + 1,
        );
      } else if (result.outcome === 'FAILED') {
        await this.completeFailure(
          claimed.request,
          claimed.attempt.id,
          result.failureReason ?? 'Payout provider rejected the transfer',
          undefined,
          undefined,
          undefined,
          claimed.request.version + 1,
        );
      } else {
        await this.markUnknown(
          id,
          claimed.attempt.id,
          'Provider requires reconciliation',
          result.providerReference,
          result.response,
        );
      }
    } catch {
      await this.markUnknown(
        id,
        claimed.attempt.id,
        'Provider outcome could not be recorded; reconcile before retrying',
      );
    }
  }

  private async assertCompletion(
    tx: Prisma.TransactionClient,
    request: SellerPayoutRequest,
    attemptId: string,
    expectedVersion: number | undefined,
    manual: boolean,
  ): Promise<void> {
    const latest = await tx.payoutAttempt.findFirst({
      where: { payoutRequestId: request.id },
      orderBy: { attemptNumber: 'desc' },
    });
    const expectedStatus = manual
      ? SellerPayoutStatus.RECONCILIATION_REQUIRED
      : SellerPayoutStatus.PROCESSING;
    if (
      request.version !== expectedVersion ||
      request.status !== expectedStatus ||
      latest?.id !== attemptId ||
      latest.status !==
        (manual
          ? PayoutAttemptStatus.RECONCILIATION_REQUIRED
          : PayoutAttemptStatus.PROCESSING)
    ) {
      throw new ConflictException(
        'Payout changed or attempt is no longer awaiting this outcome',
      );
    }
  }

  private async markUnknown(
    id: string,
    attemptId: string,
    reason: string,
    providerReference?: string,
    response?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM seller_payout_requests WHERE id = ${id}::uuid FOR UPDATE`;
      const request = await tx.sellerPayoutRequest.findUniqueOrThrow({
        where: { id },
      });
      // Never overwrite a manual decision, a newer attempt or a committed success.
      if (request.status !== SellerPayoutStatus.PROCESSING) return;
      const latest = await tx.payoutAttempt.findFirst({
        where: { payoutRequestId: id },
        orderBy: { attemptNumber: 'desc' },
      });
      if (
        latest?.id !== attemptId ||
        latest.status !== PayoutAttemptStatus.PROCESSING
      )
        return;
      await tx.payoutAttempt.update({
        where: { id: attemptId },
        data: {
          status: PayoutAttemptStatus.RECONCILIATION_REQUIRED,
          failureReason: reason,
          providerReference,
          responsePayload: response,
          completedAt: new Date(),
        },
      });
      await tx.sellerPayoutRequest.update({
        where: { id },
        data: {
          status: SellerPayoutStatus.RECONCILIATION_REQUIRED,
          failureReason: reason,
          version: { increment: 1 },
        },
      });
      await tx.payoutRequestEvent.create({
        data: {
          payoutRequestId: id,
          action: 'RECONCILIATION_REQUIRED',
          fromStatus: request.status,
          toStatus: SellerPayoutStatus.RECONCILIATION_REQUIRED,
          metadata: { reason, providerReference: providerReference ?? null },
        },
      });
    });
  }

  /**
   * A worker may die after submitting to a provider but before persisting the
   * response. Retrying such a transfer could pay twice, so stale PROCESSING
   * rows are deliberately made reconcilable instead of automatically retried.
   */
  async recoverStaleProcessing(
    staleBefore = new Date(Date.now() - 15 * 60 * 1_000),
  ): Promise<number> {
    const stale = await this.prisma.sellerPayoutRequest.findMany({
      where: {
        status: SellerPayoutStatus.PROCESSING,
        updatedAt: { lte: staleBefore },
      },
      select: { id: true },
      take: 100,
    });
    let recovered = 0;
    for (const { id } of stale) {
      const changed = await this.prisma.$transaction(async (tx) => {
        const request = await tx.sellerPayoutRequest.updateMany({
          where: {
            id,
            status: SellerPayoutStatus.PROCESSING,
            updatedAt: { lte: staleBefore },
          },
          data: {
            status: SellerPayoutStatus.RECONCILIATION_REQUIRED,
            failureReason:
              'Processing worker stopped before the provider outcome was recorded',
            version: { increment: 1 },
          },
        });
        if (request.count !== 1) return false;
        await tx.payoutAttempt.updateMany({
          where: {
            payoutRequestId: id,
            status: PayoutAttemptStatus.PROCESSING,
          },
          data: {
            status: PayoutAttemptStatus.RECONCILIATION_REQUIRED,
            failureReason:
              'Processing worker stopped before the provider outcome was recorded',
            completedAt: new Date(),
          },
        });
        await tx.payoutRequestEvent.create({
          data: {
            payoutRequestId: id,
            action: 'PROCESSING_TIMEOUT',
            fromStatus: SellerPayoutStatus.PROCESSING,
            toStatus: SellerPayoutStatus.RECONCILIATION_REQUIRED,
          },
        });
        return true;
      });
      if (changed) recovered += 1;
    }
    return recovered;
  }

  private async completeSuccess(
    request: { id: string; sellerId: string; amount: number; currency: string },
    attemptId: string,
    providerReference: string,
    actorUserId?: string,
    idempotencyKey?: string,
    requestHash?: string,
    expectedVersion?: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT seller_id FROM seller_balances WHERE seller_id = ${request.sellerId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM seller_payout_requests WHERE id = ${request.id}::uuid FOR UPDATE`;
      if (
        idempotencyKey &&
        requestHash &&
        (await this.isEventReplay(request.id, idempotencyKey, requestHash, tx))
      )
        return;
      const current = await tx.sellerPayoutRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      await this.assertCompletion(
        tx,
        current,
        attemptId,
        expectedVersion,
        !!actorUserId,
      );
      if (
        current.status !== SellerPayoutStatus.PROCESSING &&
        current.status !== SellerPayoutStatus.RECONCILIATION_REQUIRED
      )
        throw new ConflictException('Payout is not awaiting completion');
      const moved = await tx.sellerBalance.updateMany({
        where: {
          sellerId: request.sellerId,
          pendingPayoutBalance: { gte: request.amount },
        },
        data: {
          pendingPayoutBalance: { decrement: request.amount },
          paidBalance: { increment: request.amount },
        },
      });
      if (moved.count !== 1)
        throw new ConflictException(
          'Reserved payout balance requires reconciliation',
        );
      const payout = await tx.payout.create({
        data: {
          sellerId: request.sellerId,
          amount: request.amount,
          currency: request.currency,
          reference: providerReference,
          providerReference,
          note: actorUserId
            ? 'Manually reconciled payout request'
            : 'Provider payout',
          idempotencyKey: request.id,
          recordedByUserId: actorUserId,
          payoutRequestId: request.id,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          sellerId: request.sellerId,
          type: LedgerEntryType.PAYOUT,
          referenceType: 'payout_request',
          referenceId: request.id,
          grossAmount: -request.amount,
          commissionAmount: 0,
          netAmount: -request.amount,
          currency: request.currency,
          description: `Payout ${payout.id}`,
          releasedAt: new Date(),
        },
      });
      await tx.payoutAttempt.update({
        where: { id: attemptId },
        data: {
          status: PayoutAttemptStatus.SUCCEEDED,
          providerReference,
          completedAt: new Date(),
          failureReason: null,
        },
      });
      await tx.sellerPayoutRequest.update({
        where: { id: request.id },
        data: {
          status: SellerPayoutStatus.SUCCEEDED,
          failureReason: null,
          resolvedByUserId: actorUserId,
          resolvedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.payoutRequestEvent.create({
        data: {
          payoutRequestId: request.id,
          action: 'SUCCEEDED',
          fromStatus: current.status,
          toStatus: SellerPayoutStatus.SUCCEEDED,
          actorUserId,
          idempotencyKey,
          requestHash,
          metadata: { providerReference },
        },
      });
    });
  }

  private async completeFailure(
    request: { id: string },
    attemptId: string,
    reason: string,
    actorUserId?: string,
    idempotencyKey?: string,
    requestHash?: string,
    expectedVersion?: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM seller_payout_requests WHERE id = ${request.id}::uuid FOR UPDATE`;
      if (
        idempotencyKey &&
        requestHash &&
        (await this.isEventReplay(request.id, idempotencyKey, requestHash, tx))
      )
        return;
      const current = await tx.sellerPayoutRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      await this.assertCompletion(
        tx,
        current,
        attemptId,
        expectedVersion,
        !!actorUserId,
      );
      await tx.payoutAttempt.update({
        where: { id: attemptId },
        data: {
          status: PayoutAttemptStatus.FAILED,
          failureReason: reason.slice(0, 1_000),
          completedAt: new Date(),
        },
      });
      await tx.sellerPayoutRequest.update({
        where: { id: request.id },
        data: {
          status: SellerPayoutStatus.FAILED,
          failureReason: reason.slice(0, 1_000),
          resolvedByUserId: actorUserId,
          resolvedAt: actorUserId ? new Date() : undefined,
          version: { increment: 1 },
        },
      });
      await tx.payoutRequestEvent.create({
        data: {
          payoutRequestId: request.id,
          action: 'FAILED',
          fromStatus: current.status,
          toStatus: SellerPayoutStatus.FAILED,
          actorUserId,
          idempotencyKey,
          requestHash,
          metadata: { reason: reason.slice(0, 500) },
        },
      });
    });
  }

  private async transition(
    id: string,
    version: number,
    from: SellerPayoutStatus[],
    to: SellerPayoutStatus,
    action: string,
    actorUserId: string,
    idempotencyKey: string,
    metadata: Prisma.InputJsonObject,
    data: Prisma.SellerPayoutRequestUncheckedUpdateManyInput,
  ): Promise<void> {
    const requestHash = this.hash({ id, version, action, metadata });
    if (await this.isEventReplay(id, idempotencyKey, requestHash)) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM seller_payout_requests WHERE id = ${id}::uuid FOR UPDATE`;
      if (await this.isEventReplay(id, idempotencyKey, requestHash, tx)) return;
      const current = await tx.sellerPayoutRequest.findUnique({
        where: { id },
      });
      if (!current) throw new NotFoundException('Payout request not found');
      const changed = await tx.sellerPayoutRequest.updateMany({
        where: { id, version, status: { in: from } },
        data: { ...data, status: to, version: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'Payout request changed or transition is invalid',
        );
      await tx.payoutRequestEvent.create({
        data: {
          payoutRequestId: id,
          action,
          fromStatus: current.status,
          toStatus: to,
          actorUserId,
          idempotencyKey,
          requestHash,
          metadata,
        },
      });
    });
  }

  private async releaseRequest(
    id: string,
    sellerId: string,
    version: number,
    from: SellerPayoutStatus,
    to: SellerPayoutStatus,
    action: string,
    reason: string,
    actorUserId: string,
    idempotencyKey: string,
    extra: Prisma.SellerPayoutRequestUncheckedUpdateManyInput = {},
  ): Promise<void> {
    const requestHash = this.hash({ id, version, action, reason });
    if (await this.isEventReplay(id, idempotencyKey, requestHash)) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT seller_id FROM seller_balances WHERE seller_id = ${sellerId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM seller_payout_requests WHERE id = ${id}::uuid FOR UPDATE`;
      if (await this.isEventReplay(id, idempotencyKey, requestHash, tx)) return;
      const request = await tx.sellerPayoutRequest.findFirst({
        where: { id, sellerId },
      });
      if (!request) throw new NotFoundException('Payout request not found');
      const changed = await tx.sellerPayoutRequest.updateMany({
        where: { id, sellerId, version, status: from },
        data: {
          ...extra,
          status: to,
          cancellationReason: reason.trim(),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'Payout request changed or cannot be cancelled',
        );
      const moved = await tx.sellerBalance.updateMany({
        where: { sellerId, pendingPayoutBalance: { gte: request.amount } },
        data: {
          pendingPayoutBalance: { decrement: request.amount },
          balance: { increment: request.amount },
        },
      });
      if (moved.count !== 1)
        throw new ConflictException(
          'Reserved payout balance requires reconciliation',
        );
      await tx.payoutRequestEvent.create({
        data: {
          payoutRequestId: id,
          action,
          fromStatus: from,
          toStatus: to,
          actorUserId,
          idempotencyKey,
          requestHash,
          metadata: { reason: reason.trim() },
        },
      });
    });
  }

  private async findRequest(
    id: string,
    sellerId?: string,
  ): Promise<PayoutRequestView> {
    const row = await this.prisma.sellerPayoutRequest.findFirst({
      where: { id, sellerId },
      include: REQUEST_INCLUDE,
    });
    if (!row) throw new NotFoundException('Payout request not found');
    return this.toRequestView(row);
  }

  private async findRawRequest(id: string): Promise<SellerPayoutRequest> {
    const request = await this.prisma.sellerPayoutRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Payout request not found');
    return request;
  }

  private toRequestView(
    row: Prisma.SellerPayoutRequestGetPayload<{
      include: typeof REQUEST_INCLUDE;
    }>,
  ): PayoutRequestView {
    const {
      destinationSnapshot: _destination,
      requestHash: _hash,
      ...view
    } = row;
    void _destination;
    void _hash;
    return view;
  }

  private async isEventReplay(
    requestId: string,
    idempotencyKey: string,
    requestHash: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    const event = await client.payoutRequestEvent.findUnique({
      where: { idempotencyKey },
    });
    if (!event) return false;
    if (
      event.payoutRequestId !== requestId ||
      event.requestHash !== requestHash
    ) {
      throw new ConflictException(
        'Idempotency key belongs to a different payout action',
      );
    }
    return true;
  }

  private async throwAccountConflict(
    id: string,
    sellerId: string,
  ): Promise<never> {
    const account = await this.prisma.sellerPayoutAccount.findFirst({
      where: { id, sellerId },
    });
    if (!account) throw new NotFoundException('Payout account not found');
    throw new ConflictException(
      'Payout account changed or transition is invalid',
    );
  }

  private validateDestination(
    value: Record<string, unknown>,
  ): Prisma.InputJsonObject {
    const entries = Object.entries(value);
    if (entries.length === 0 || entries.length > 20) {
      throw new BadRequestException(
        'Destination must contain between 1 and 20 fields',
      );
    }
    const destination: Record<string, string> = {};
    for (const [key, raw] of entries) {
      if (!key.trim() || key.length > 50 || typeof raw !== 'string') {
        throw new BadRequestException(
          'Destination keys and values must be strings',
        );
      }
      const value = raw.trim();
      if (!value || value.length > 500) {
        throw new BadRequestException(
          'Destination values must be 1 to 500 characters',
        );
      }
      destination[key] = value;
    }
    return destination as Prisma.InputJsonObject;
  }

  private maskDestination(destination: Prisma.InputJsonObject): string {
    const preferred = [
      'accountNumber',
      'phoneNumber',
      'mobileNumber',
      'iban',
      'reference',
    ];
    const value =
      preferred
        .map((key) => destination[key])
        .find((item): item is string => typeof item === 'string') ??
      Object.values(destination).find(
        (item): item is string => typeof item === 'string',
      );
    if (!value)
      throw new BadRequestException('Destination has no maskable reference');
    const visible = value.slice(-4);
    return `${'*'.repeat(Math.max(4, Math.min(12, value.length - 4)))}${visible}`;
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
