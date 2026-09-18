import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

const PAD_WIDTH = 6;

/**
 * Human-readable sequential codes (PO/receipt/fulfillment numbers), backed
 * by a single `sequence_counters` row per key. A single `INSERT ... ON
 * CONFLICT DO UPDATE ... RETURNING` is atomic under Postgres's own
 * row-level locking, so concurrent requests never hand out the same number
 * without an explicit `FOR UPDATE` lock.
 */
@Injectable()
export class NumberingService {
  async nextPurchaseOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    return this.nextNumber(tx, 'purchase_order', 'PO');
  }

  async nextGoodsReceiptNumber(tx: Prisma.TransactionClient): Promise<string> {
    return this.nextNumber(tx, 'goods_receipt', 'GR');
  }

  async nextFulfillmentNumber(tx: Prisma.TransactionClient): Promise<string> {
    return this.nextNumber(tx, 'fulfillment_order', 'FF');
  }

  async nextFulfillmentDispatchNumber(tx: Prisma.TransactionClient): Promise<string> {
    return this.nextNumber(tx, 'fulfillment_dispatch', 'FD');
  }

  async nextShipmentNumber(tx: Prisma.TransactionClient): Promise<string> {
    return this.nextNumber(tx, 'shipment', 'SH');
  }

  async nextReturnRmaNumber(tx: Prisma.TransactionClient): Promise<string> {
    return this.nextNumber(tx, 'return_rma', 'RMA');
  }

  private async nextNumber(
    tx: Prisma.TransactionClient,
    sequenceKey: string,
    prefix: string,
  ): Promise<string> {
    const year = new Date().getUTCFullYear();
    const value = await this.nextValue(tx, `${sequenceKey}:${year}`);
    return `${prefix}-${year}-${String(value).padStart(PAD_WIDTH, '0')}`;
  }

  private async nextValue(
    tx: Prisma.TransactionClient,
    key: string,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO sequence_counters (key, value, updated_at)
      VALUES (${key}, 1, now())
      ON CONFLICT (key) DO UPDATE
        SET value = sequence_counters.value + 1, updated_at = now()
      RETURNING value
    `;

    return rows[0]?.value ?? 1;
  }
}
