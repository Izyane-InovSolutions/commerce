import { Injectable } from '@nestjs/common';
import { RefundCaseSource } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import type { JobHandler } from '../../../infrastructure/jobs/job-handler.interface';
import { RefundCasesService } from '../refund-cases.service';

export const FULFILLMENT_CANCELLATION_REFUND_JOB_TYPE =
  'refunds.process_fulfillment_cancellation';

type CancelledLine = {
  fulfillmentLineId: string;
  orderItemId: string;
  quantity: number;
};

type JobPayload = {
  orderId: string;
  sellerOrderId: string;
  lines: CancelledLine[];
  reason: string;
};

function parsePayload(payload: Prisma.JsonValue): JobPayload {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  )
    throw new Error(
      `Malformed ${FULFILLMENT_CANCELLATION_REFUND_JOB_TYPE} payload`,
    );
  const value = payload as Record<string, unknown>;
  if (
    typeof value.orderId !== 'string' ||
    typeof value.sellerOrderId !== 'string' ||
    typeof value.reason !== 'string' ||
    !Array.isArray(value.lines) ||
    value.lines.length === 0 ||
    !value.lines.every(
      (line): line is CancelledLine =>
        typeof line === 'object' &&
        line !== null &&
        typeof (line as CancelledLine).fulfillmentLineId === 'string' &&
        typeof (line as CancelledLine).orderItemId === 'string' &&
        Number.isSafeInteger((line as CancelledLine).quantity) &&
        (line as CancelledLine).quantity > 0,
    )
  )
    throw new Error(
      `Malformed ${FULFILLMENT_CANCELLATION_REFUND_JOB_TYPE} payload`,
    );
  return {
    orderId: value.orderId,
    sellerOrderId: value.sellerOrderId,
    reason: value.reason,
    lines: value.lines,
  };
}

@Injectable()
export class FulfillmentCancellationRefundHandler implements JobHandler {
  readonly type = FULFILLMENT_CANCELLATION_REFUND_JOB_TYPE;

  constructor(
    private readonly prisma: PrismaService,
    private readonly refundCasesService: RefundCasesService,
  ) {}

  async handle(payload: Prisma.JsonValue): Promise<void> {
    const parsed = parsePayload(payload);

    const orderItems = await this.prisma.orderItem.findMany({
      where: { id: { in: parsed.lines.map((line) => line.orderItemId) } },
    });
    const byId = new Map(orderItems.map((item) => [item.id, item]));

    let amount = 0;
    let currency: string | undefined;
    const items = parsed.lines.map((line) => {
      const orderItem = byId.get(line.orderItemId);
      if (!orderItem)
        throw new Error(`Order item ${line.orderItemId} was not found`);
      currency = currency ?? orderItem.currency;
      const itemAmount = orderItem.unitAmount * line.quantity;
      amount += itemAmount;
      return {
        orderItemId: line.orderItemId,
        quantity: line.quantity,
        amount: itemAmount,
        currency: orderItem.currency,
      };
    });

    if (!currency) throw new Error('Unable to determine refund currency');

    // Stable across job retries: the outbox payload carries no id of its
    // own, so the sorted set of cancelled fulfillment lines stands in for
    // one, keeping a re-run of this job from creating a second RefundCase
    // for the same cancellation.
    const idempotencyKey = `fulfillment-cancel:${[...parsed.lines]
      .map((line) => line.fulfillmentLineId)
      .sort()
      .join(',')}`;

    await this.refundCasesService.createCase({
      sellerOrderId: parsed.sellerOrderId,
      source: RefundCaseSource.FULFILLMENT_CANCELLATION,
      amount,
      shippingAmount: 0,
      currency,
      reason: `Fulfillment cancellation: ${parsed.reason}`,
      idempotencyKey,
      items,
    });
  }
}
