import { Injectable } from '@nestjs/common';
import {
  FulfillmentWorkItemType,
  OfferFulfillmentMode,
  type Prisma,
  type Reservation,
} from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../../infrastructure/jobs/outbox.service';
import { NumberingService } from '../../../common/numbering/numbering.service';
import { AuditService } from '../../audit/audit.service';

type LineEntry = {
  orderItemId: string;
  variantId: string;
  reservation: Reservation;
  inventoryRecordId: string;
  quantity: number;
};

/**
 * Turns a paid order's PLATFORM-mode lines into FulfillmentOrder rows, one
 * per (shippingGroupId, warehouseId) pair. Idempotent by construction: the
 * `@@unique([shippingGroupId, warehouseId])` on FulfillmentOrder makes a
 * replay (the same `order.paid` job retried, or the backfill script hitting
 * an order twice) a no-op rather than a duplicate.
 */
@Injectable()
export class FulfillmentProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingService: NumberingService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  async provisionForOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        sellerOrders: {
          include: {
            shippingGroups: {
              where: { fulfillmentMode: OfferFulfillmentMode.PLATFORM },
              include: {
                items: { include: { offer: { select: { variantId: true } } } },
              },
            },
          },
        },
      },
    });

    // A job payload naming a nonexistent order can only mean the order was
    // never committed (or the DB was reset under a dev/test run) — nothing
    // to provision, and retrying would never succeed either.
    if (!order) return;

    for (const sellerOrder of order.sellerOrders) {
      for (const group of sellerOrder.shippingGroups) {
        await this.provisionShippingGroup(order.id, sellerOrder.id, group.id, group.items);
      }
    }
  }

  private async provisionShippingGroup(
    orderId: string,
    sellerOrderId: string,
    shippingGroupId: string,
    items: {
      id: string;
      quantity: number;
      reservationId: string | null;
      offer: { variantId: string };
    }[],
  ): Promise<void> {
    const byWarehouse = new Map<string, LineEntry[]>();

    for (const item of items) {
      // A PLATFORM line that never reserved (shouldn't happen once checkout
      // has run) simply cannot be fulfilled — skip rather than fail the
      // whole shipping group over one bad line.
      if (!item.reservationId) continue;
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: item.reservationId },
      });
      if (!reservation) continue;
      const record = await this.prisma.inventoryRecord.findUnique({
        where: { id: reservation.inventoryRecordId },
      });
      if (!record?.warehouseId) continue;

      const entries = byWarehouse.get(record.warehouseId) ?? [];
      entries.push({
        orderItemId: item.id,
        variantId: item.offer.variantId,
        reservation,
        inventoryRecordId: record.id,
        quantity: item.quantity,
      });
      byWarehouse.set(record.warehouseId, entries);
    }

    for (const [warehouseId, entries] of byWarehouse) {
      await this.createFulfillmentOrder(
        orderId,
        sellerOrderId,
        shippingGroupId,
        warehouseId,
        entries,
      );
    }
  }

  private async createFulfillmentOrder(
    orderId: string,
    sellerOrderId: string,
    shippingGroupId: string,
    warehouseId: string,
    entries: LineEntry[],
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const fulfillmentNumber = await this.numberingService.nextFulfillmentNumber(tx);

        const fulfillmentOrder = await tx.fulfillmentOrder.create({
          data: {
            fulfillmentNumber,
            orderId,
            sellerOrderId,
            shippingGroupId,
            warehouseId,
            lines: {
              create: entries.map((entry) => ({
                orderItemId: entry.orderItemId,
                variantId: entry.variantId,
                reservationId: entry.reservation.id,
                inventoryRecordId: entry.inventoryRecordId,
                allocatedQuantity: entry.quantity,
              })),
            },
            workItems: {
              create: [
                { type: FulfillmentWorkItemType.PICK },
                { type: FulfillmentWorkItemType.PACK },
              ],
            },
          },
        });

        await tx.fulfillmentEvent.create({
          data: {
            fulfillmentOrderId: fulfillmentOrder.id,
            type: 'fulfillment.created',
            metadata: { orderId, sellerOrderId, shippingGroupId, warehouseId },
          },
        });

        await this.auditService.record(
          {
            action: 'fulfillment.order.created',
            targetType: 'FulfillmentOrder',
            targetId: fulfillmentOrder.id,
            metadata: { orderId, fulfillmentNumber, warehouseId },
          },
          tx,
        );

        await this.outboxService.record(
          {
            topic: 'fulfillment.provisioned',
            aggregateType: 'FulfillmentOrder',
            aggregateId: fulfillmentOrder.id,
            payload: { orderId, fulfillmentNumber, warehouseId },
          },
          tx,
        );
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) return;
      throw error;
    }
  }

  private isPrismaError(
    error: unknown,
    code: string,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === code
    );
  }
}
