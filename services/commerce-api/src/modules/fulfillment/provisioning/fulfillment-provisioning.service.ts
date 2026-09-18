import { Injectable } from '@nestjs/common';
import {
  FulfillmentStatus,
  FulfillmentWorkItemType,
  OfferFulfillmentMode,
  OrderStatus,
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
 * per (shippingGroupId, warehouseId) pair, and its SELLER-mode (#37)
 * shipping groups into one warehouseId: null FulfillmentOrder each (a
 * seller fulfills from their own single offer-scoped stock, never split
 * across a platform warehouse). Idempotent by construction: the
 * `@@unique([shippingGroupId, warehouseId])` on FulfillmentOrder (and the
 * hand-added partial unique index for warehouseId IS NULL) make a replay
 * (the same `order.paid` job retried, or the backfill script hitting an
 * order twice) a no-op rather than a duplicate.
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
        if (group.fulfillmentMode === OfferFulfillmentMode.SELLER) {
          await this.provisionSellerShippingGroup(
            order.id,
            sellerOrder.id,
            group.id,
            group.items,
          );
        } else {
          await this.provisionShippingGroup(order.id, sellerOrder.id, group.id, group.items);
        }
      }
    }
  }

  /**
   * Idempotent re-run for orders paid before #37 shipped: finds every
   * SELLER-mode shipping group on a paid/settled order that still has no
   * FulfillmentOrder and provisions it, relying on the same unique-
   * constraint-based idempotency as the normal `order.paid` path — safe to
   * run any number of times. Invoked via
   * `npx ts-node scripts/backfill-seller-fulfillments.ts` (see that script).
   */
  async backfillSellerFulfillments(): Promise<{ scanned: number; provisioned: number }> {
    const groups = await this.prisma.shippingGroup.findMany({
      where: {
        fulfillmentMode: OfferFulfillmentMode.SELLER,
        fulfillmentOrders: { none: {} },
        order: {
          status: {
            in: [OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED],
          },
        },
      },
      select: { id: true, orderId: true, sellerOrderId: true },
    });

    let provisioned = 0;
    for (const group of groups) {
      const items = await this.prisma.orderItem.findMany({
        where: { shippingGroupId: group.id },
        include: { offer: { select: { variantId: true } } },
      });
      await this.provisionSellerShippingGroup(group.orderId, group.sellerOrderId, group.id, items);
      const created = await this.prisma.fulfillmentOrder.findFirst({
        where: { shippingGroupId: group.id, warehouseId: null },
        select: { id: true },
      });
      if (created) provisioned += 1;
    }

    return { scanned: groups.length, provisioned };
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

  /**
   * #37: a SELLER-mode shipping group's items are all backed by the same
   * kind of stock (the seller's own offer-scoped InventoryRecord, no
   * warehouseId) — unlike the PLATFORM path there is nothing to group by,
   * so at most one FulfillmentOrder is created for the whole group.
   */
  private async provisionSellerShippingGroup(
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
    const entries: LineEntry[] = [];

    for (const item of items) {
      if (!item.reservationId) continue;
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: item.reservationId },
      });
      if (!reservation) continue;
      const record = await this.prisma.inventoryRecord.findUnique({
        where: { id: reservation.inventoryRecordId },
      });
      // A seller-scoped record never has a warehouseId — a record that does
      // means this line was somehow reserved against platform stock, which
      // cannot happen for a SELLER-mode offer; skip defensively.
      if (!record || record.warehouseId) continue;

      entries.push({
        orderItemId: item.id,
        variantId: item.offer.variantId,
        reservation,
        inventoryRecordId: record.id,
        quantity: item.quantity,
      });
    }

    if (entries.length === 0) return;

    await this.createSellerFulfillmentOrder(orderId, sellerOrderId, shippingGroupId, entries);
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

  /**
   * #37 sibling of `createFulfillmentOrder`: warehouseId: null and
   * AWAITING_ACCEPTANCE (the seller must accept before any of its lifecycle
   * moves), and no PICK/PACK FulfillmentWorkItem rows — there is no internal
   * pick/pack workflow for a seller's own stock, so `recomputeStatus`
   * derives status from `acceptedAt`/quantities alone (see
   * `deriveFulfillmentStatus`'s `requiresAcceptance` input) rather than from
   * work-item progress. Idempotency is identical to the platform path: a
   * P2002 from the hand-added partial unique index
   * (`fulfillment_orders_seller_shipping_group_key`) is a silent no-op.
   */
  private async createSellerFulfillmentOrder(
    orderId: string,
    sellerOrderId: string,
    shippingGroupId: string,
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
            warehouseId: null,
            status: FulfillmentStatus.AWAITING_ACCEPTANCE,
            lines: {
              create: entries.map((entry) => ({
                orderItemId: entry.orderItemId,
                variantId: entry.variantId,
                reservationId: entry.reservation.id,
                inventoryRecordId: entry.inventoryRecordId,
                allocatedQuantity: entry.quantity,
              })),
            },
          },
        });

        await tx.fulfillmentEvent.create({
          data: {
            fulfillmentOrderId: fulfillmentOrder.id,
            type: 'fulfillment.created',
            metadata: { orderId, sellerOrderId, shippingGroupId, warehouseId: null },
          },
        });

        await this.auditService.record(
          {
            action: 'fulfillment.order.created',
            targetType: 'FulfillmentOrder',
            targetId: fulfillmentOrder.id,
            metadata: { orderId, fulfillmentNumber, warehouseId: null },
          },
          tx,
        );

        await this.outboxService.record(
          {
            topic: 'fulfillment.provisioned',
            aggregateType: 'FulfillmentOrder',
            aggregateId: fulfillmentOrder.id,
            payload: { orderId, fulfillmentNumber, warehouseId: null },
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
