import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ShipmentStatus } from '@prisma/client';

import { NumberingService } from '../src/common/numbering/numbering.service';
import { PrismaService } from '../src/database/prisma.service';
import { BackgroundJobsService } from '../src/infrastructure/jobs/background-jobs.service';
import { OutboxService } from '../src/infrastructure/jobs/outbox.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { FulfillmentsService } from '../src/modules/fulfillment/fulfillments.service';
import { FulfillmentProvisioningService } from '../src/modules/fulfillment/provisioning/fulfillment-provisioning.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import type { SellersService } from '../src/modules/sellers/sellers.service';
import { CarrierProviderRegistry } from '../src/modules/shipments/carrier-provider.registry';
import { ManualCarrierProvider } from '../src/modules/shipments/providers/manual-carrier.provider';
import { ShipmentsService } from '../src/modules/shipments/shipments.service';

/**
 * Exercises the #37 seller fulfillment lifecycle (accept/reject/pack/cancel/
 * dispatch/tracking) against a real, migrated Postgres database — see
 * test/fulfillment.integration-spec.ts for why this exists alongside the
 * mocked-Prisma unit specs.
 *
 * SellersService itself pulls in Media/Product/Users collaborators that are
 * unrelated to this ticket's concurrency-safety goals, so this suite backs
 * FulfillmentsService/ShipmentsService with a minimal real-Postgres-backed
 * stand-in that implements only `lockApproved` (the one method these
 * services call) — the same row-lock semantics as the real service, without
 * pulling in its unrelated dependency graph.
 */
describe('Seller fulfillment (#37, integration, real Postgres)', () => {
  const prisma = new PrismaService();
  const auditService = new AuditService(prisma);
  const outboxService = new OutboxService(prisma);
  const numberingService = new NumberingService();
  const backgroundJobsEnqueueMock = jest.fn().mockResolvedValue(undefined);
  const backgroundJobsServiceStub = {
    enqueue: backgroundJobsEnqueueMock,
  } as unknown as BackgroundJobsService;
  const inventoryService = new InventoryService(
    prisma,
    backgroundJobsServiceStub,
  );
  const provisioningService = new FulfillmentProvisioningService(
    prisma,
    numberingService,
    auditService,
    outboxService,
  );

  const sellersServiceStub = {
    lockApproved: async (userId: string, tx: Prisma.TransactionClient) => {
      const locked = await tx.seller.updateMany({
        where: { ownerUserId: userId, status: 'APPROVED' },
        data: { updatedAt: new Date() },
      });
      if (locked.count !== 1)
        throw new ForbiddenException('Seller approval is required');
      return tx.seller.findUniqueOrThrow({ where: { ownerUserId: userId } });
    },
  } as unknown as SellersService;

  const fulfillmentsService = new FulfillmentsService(
    prisma,
    inventoryService,
    numberingService,
    auditService,
    outboxService,
    backgroundJobsServiceStub,
    sellersServiceStub,
  );
  const carrierProviderRegistry = new CarrierProviderRegistry([
    new ManualCarrierProvider(),
  ]);
  const shipmentsService = new ShipmentsService(
    prisma,
    fulfillmentsService,
    numberingService,
    carrierProviderRegistry,
    auditService,
    outboxService,
    sellersServiceStub,
  );

  const suffix = randomUUID().slice(0, 8);
  const createdProductIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdSellerIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdOrderIds.length) {
      await prisma.refundCase.deleteMany({
        where: { sellerOrder: { orderId: { in: createdOrderIds } } },
      });
      const fulfillmentOrders = await prisma.fulfillmentOrder.findMany({
        where: { orderId: { in: createdOrderIds } },
        select: { id: true },
      });
      const fulfillmentOrderIds = fulfillmentOrders.map((fo) => fo.id);
      if (fulfillmentOrderIds.length) {
        await prisma.fulfillmentDispatch.deleteMany({
          where: { fulfillmentOrderId: { in: fulfillmentOrderIds } },
        });
      }
      await prisma.shipment.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.fulfillmentOrder.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    if (createdSellerIds.length) {
      // Offer.sellerId is Restrict — must go before the seller row.
      await prisma.offer.deleteMany({
        where: { sellerId: { in: createdSellerIds } },
      });
      await prisma.seller.deleteMany({
        where: { id: { in: createdSellerIds } },
      });
    }
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: createdUserIds } },
    });
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (createdProductIds.length) {
      await prisma.product.deleteMany({
        where: { id: { in: createdProductIds } },
      });
    }
    await prisma.$disconnect();
  });

  /** Builds a paid, single-line SELLER-mode order with a committed
   * offer-scoped reservation — the state checkout leaves behind for a
   * seller-fulfilled offer — and provisions the seller FulfillmentOrder from
   * it via the real provisioning path. */
  async function createSellerFulfillment(
    quantity: number,
    onHand = quantity + 100,
  ): Promise<{
    fulfillmentOrderId: string;
    fulfillmentLineId: string;
    offerId: string;
    sellerUserId: string;
    orderId: string;
  }> {
    const rowSuffix = `${suffix}-${randomUUID().slice(0, 8)}`;

    const sellerUser = await prisma.user.create({
      data: {
        email: `seller-owner-${rowSuffix}@example.test`,
        passwordHash: 'x',
        role: 'SELLER',
      },
    });
    createdUserIds.push(sellerUser.id);
    const buyer = await prisma.user.create({
      data: { email: `buyer-${rowSuffix}@example.test`, passwordHash: 'x' },
    });
    createdUserIds.push(buyer.id);

    const seller = await prisma.seller.create({
      data: {
        ownerUserId: sellerUser.id,
        businessName: `Seller ${rowSuffix}`,
        registrationNumber: `REG-${rowSuffix}`,
        country: 'ZM',
        businessAddress: 'Test address',
        contactEmail: `seller-${rowSuffix}@example.test`,
        status: 'APPROVED',
      },
    });
    createdSellerIds.push(seller.id);

    const product = await prisma.product.create({
      data: {
        name: `Seller Product ${rowSuffix}`,
        slug: `seller-product-${rowSuffix}`,
      },
    });
    createdProductIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, skuCode: `SEL-SKU-${rowSuffix}` },
    });
    const offer = await prisma.offer.create({
      data: {
        variantId: variant.id,
        sellerId: seller.id,
        stockSource: 'SELLER',
        fulfillmentMode: 'SELLER',
      },
    });

    const record = await prisma.inventoryRecord.create({
      data: {
        offerId: offer.id,
        variantId: variant.id,
        onHand,
        reserved: quantity,
      },
    });
    const reservation = await prisma.reservation.create({
      data: {
        inventoryRecordId: record.id,
        quantity,
        status: 'COMMITTED',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const order = await prisma.order.create({
      data: {
        userId: buyer.id,
        status: 'PAID',
        currency: 'ZMW',
        subtotal: 1_000 * quantity,
        total: 1_000 * quantity,
        shippingAddress: { line1: 'Test', city: 'Test', country: 'ZM' },
      },
    });
    createdOrderIds.push(order.id);

    const sellerOrder = await prisma.sellerOrder.create({
      data: {
        orderId: order.id,
        sellerId: seller.id,
        status: 'PAID',
        subtotal: 1_000 * quantity,
        total: 1_000 * quantity,
        currency: 'ZMW',
      },
    });
    const shippingGroup = await prisma.shippingGroup.create({
      data: {
        orderId: order.id,
        sellerOrderId: sellerOrder.id,
        fulfillmentMode: 'SELLER',
        serviceLevel: 'STANDARD',
        rateCode: 'SELLER_STANDARD_V1',
        methodCode: 'SELLER_STANDARD_V1',
        methodName: 'Seller shipping',
        subtotal: 1_000 * quantity,
        shippingAmount: 0,
        total: 1_000 * quantity,
        currency: 'ZMW',
        quoteId: `quote-${rowSuffix}`,
        quoteExpiresAt: new Date(Date.now() + 3_600_000),
        estimatedDeliveryMinDays: 2,
        estimatedDeliveryMaxDays: 5,
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        sellerOrderId: sellerOrder.id,
        shippingGroupId: shippingGroup.id,
        offerId: offer.id,
        quantity,
        unitAmount: 1_000,
        currency: 'ZMW',
        lineTotal: 1_000 * quantity,
        reservationId: reservation.id,
      },
    });

    await provisioningService.provisionForOrder(order.id);

    const fulfillmentOrder = await prisma.fulfillmentOrder.findFirstOrThrow({
      where: { shippingGroupId: shippingGroup.id, warehouseId: null },
      include: { lines: true },
    });
    const [line] = fulfillmentOrder.lines;
    if (!line)
      throw new Error('expected a provisioned seller fulfillment line');

    return {
      fulfillmentOrderId: fulfillmentOrder.id,
      fulfillmentLineId: line.id,
      offerId: offer.id,
      sellerUserId: sellerUser.id,
      orderId: order.id,
    };
  }

  it('provisions a seller-mode fulfillment order in AWAITING_ACCEPTANCE with no work items', async () => {
    const { fulfillmentOrderId } = await createSellerFulfillment(5);
    const fo = await prisma.fulfillmentOrder.findUniqueOrThrow({
      where: { id: fulfillmentOrderId },
      include: { workItems: true },
    });
    expect(fo.status).toBe('AWAITING_ACCEPTANCE');
    expect(fo.warehouseId).toBeNull();
    expect(fo.workItems).toHaveLength(0);
  });

  it('404s a fulfillment order owned by a different seller', async () => {
    const { fulfillmentOrderId } = await createSellerFulfillment(3);
    const otherUser = await prisma.user.create({
      data: {
        email: `other-${randomUUID()}@example.test`,
        passwordHash: 'x',
        role: 'SELLER',
      },
    });
    createdUserIds.push(otherUser.id);
    const otherSeller = await prisma.seller.create({
      data: {
        ownerUserId: otherUser.id,
        businessName: 'Other seller',
        registrationNumber: `REG-${randomUUID()}`,
        country: 'ZM',
        businessAddress: 'Test address',
        contactEmail: `other-${randomUUID()}@example.test`,
        status: 'APPROVED',
      },
    });
    createdSellerIds.push(otherSeller.id);

    await expect(
      fulfillmentsService.acceptSellerFulfillment(
        fulfillmentOrderId,
        otherUser.id,
        0,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an unapproved/suspended seller', async () => {
    const { fulfillmentOrderId, sellerUserId } =
      await createSellerFulfillment(2);
    await prisma.seller.update({
      where: { ownerUserId: sellerUserId },
      data: { status: 'SUSPENDED' },
    });

    await expect(
      fulfillmentsService.acceptSellerFulfillment(
        fulfillmentOrderId,
        sellerUserId,
        0,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts, fully picks, and a duplicate accept with a stale version conflicts', async () => {
    const { fulfillmentOrderId, fulfillmentLineId, sellerUserId } =
      await createSellerFulfillment(4);

    const accepted = await fulfillmentsService.acceptSellerFulfillment(
      fulfillmentOrderId,
      sellerUserId,
      0,
    );
    // Accept auto-completes the pick stage, so a fully-picked seller order
    // lands directly on PICKED (pack-ready) rather than READY_TO_PICK.
    expect(accepted.status).toBe('PICKED');
    const line = accepted.lines.find((l) => l.id === fulfillmentLineId)!;
    expect(line.pickedQuantity).toBe(4);

    await expect(
      fulfillmentsService.acceptSellerFulfillment(
        fulfillmentOrderId,
        sellerUserId,
        0,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('packs partially across multiple calls, then dispatches atomically with an initial tracking event', async () => {
    const { fulfillmentOrderId, fulfillmentLineId, sellerUserId, offerId } =
      await createSellerFulfillment(6);
    await fulfillmentsService.acceptSellerFulfillment(
      fulfillmentOrderId,
      sellerUserId,
      0,
    );

    await fulfillmentsService.recordSellerPack(
      fulfillmentOrderId,
      sellerUserId,
      [{ fulfillmentLineId, quantity: 4 }],
      sellerUserId,
      randomUUID(),
    );
    const afterFirstPack = await fulfillmentsService.recordSellerPack(
      fulfillmentOrderId,
      sellerUserId,
      [{ fulfillmentLineId, quantity: 2 }],
      sellerUserId,
      randomUUID(),
    );
    const packedLine = afterFirstPack.lines.find(
      (l) => l.id === fulfillmentLineId,
    )!;
    expect(packedLine.packedQuantity).toBe(6);
    expect(afterFirstPack.status).toBe('PACKED');

    await expect(
      fulfillmentsService.recordSellerPack(
        fulfillmentOrderId,
        sellerUserId,
        [{ fulfillmentLineId, quantity: 1 }],
        sellerUserId,
        randomUUID(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const dispatchKey = randomUUID();
    const dispatched = await fulfillmentsService.dispatchSellerFulfillment(
      fulfillmentOrderId,
      sellerUserId,
      {
        lines: [{ fulfillmentLineId, quantity: 6 }],
        carrierCode: 'DHL',
        trackingReference: 'TRK-1',
      },
      sellerUserId,
      dispatchKey,
    );
    expect(dispatched.status).toBe('DISPATCHED');
    expect(dispatched.shipments).toHaveLength(1);
    const shipment = dispatched.shipments[0]!;
    expect(shipment.warehouseId).toBeNull();
    expect(shipment.status).toBe(ShipmentStatus.DISPATCHED);

    const trackingEvents = await prisma.trackingEvent.findMany({
      where: { shipmentId: shipment.id },
    });
    expect(trackingEvents).toHaveLength(1);
    expect(trackingEvents[0]!.source).toBe('SELLER_MANUAL');
    expect(trackingEvents[0]!.normalizedStatus).toBe(ShipmentStatus.DISPATCHED);

    // Idempotent replay: same key + same payload returns the same dispatch
    // result rather than re-dispatching.
    const replay = await fulfillmentsService.dispatchSellerFulfillment(
      fulfillmentOrderId,
      sellerUserId,
      {
        lines: [{ fulfillmentLineId, quantity: 6 }],
        carrierCode: 'DHL',
        trackingReference: 'TRK-1',
      },
      sellerUserId,
      dispatchKey,
    );
    expect(replay.shipments).toHaveLength(1);
    expect(replay.shipments[0]!.id).toBe(shipment.id);

    // Same key, different payload -> conflict.
    await expect(
      fulfillmentsService.dispatchSellerFulfillment(
        fulfillmentOrderId,
        sellerUserId,
        { lines: [{ fulfillmentLineId, quantity: 6 }], carrierCode: 'FEDEX' },
        sellerUserId,
        dispatchKey,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    // A seller can now report real carrier progress on the dispatched shipment.
    const updated = await shipmentsService.addSellerTrackingEvent(
      shipment.id,
      sellerUserId,
      { normalizedStatus: ShipmentStatus.IN_TRANSIT, occurredAt: new Date() },
      sellerUserId,
      randomUUID(),
    );
    expect(updated.status).toBe(ShipmentStatus.IN_TRANSIT);

    void offerId;
  });

  it('rejects before any dispatch, restores inventory, and enqueues exactly one refund job', async () => {
    const { fulfillmentOrderId, offerId, sellerUserId } =
      await createSellerFulfillment(5);
    const recordBefore = await prisma.inventoryRecord.findUniqueOrThrow({
      where: { offerId },
    });

    backgroundJobsEnqueueMock.mockClear();
    const rejected = await fulfillmentsService.rejectSellerFulfillment(
      fulfillmentOrderId,
      sellerUserId,
      0,
      'out of stock',
      sellerUserId,
      randomUUID(),
    );
    expect(rejected.status).toBe('CANCELLED');

    const recordAfter = await prisma.inventoryRecord.findUniqueOrThrow({
      where: { offerId },
    });
    expect(recordAfter.onHand).toBe(recordBefore.onHand + 5);
    expect(backgroundJobsEnqueueMock).toHaveBeenCalledTimes(1);

    const movements = await prisma.inventoryMovement.findMany({
      where: { inventoryRecordId: recordAfter.id, type: 'RETURN' },
    });
    expect(movements).toHaveLength(1);
  });

  it('refuses to reject once any quantity has been dispatched', async () => {
    const { fulfillmentOrderId, fulfillmentLineId, sellerUserId } =
      await createSellerFulfillment(3);
    await fulfillmentsService.acceptSellerFulfillment(
      fulfillmentOrderId,
      sellerUserId,
      0,
    );
    await fulfillmentsService.recordSellerPack(
      fulfillmentOrderId,
      sellerUserId,
      [{ fulfillmentLineId, quantity: 3 }],
      sellerUserId,
      randomUUID(),
    );
    await fulfillmentsService.dispatchSellerFulfillment(
      fulfillmentOrderId,
      sellerUserId,
      { lines: [{ fulfillmentLineId, quantity: 1 }], carrierCode: 'DHL' },
      sellerUserId,
      randomUUID(),
    );

    await expect(
      fulfillmentsService.rejectSellerFulfillment(
        fulfillmentOrderId,
        sellerUserId,
        1,
        'too late',
        sellerUserId,
        randomUUID(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancels only the selected line, leaving other seller-fulfilled quantity untouched', async () => {
    const { fulfillmentOrderId, fulfillmentLineId, sellerUserId } =
      await createSellerFulfillment(8);
    await fulfillmentsService.acceptSellerFulfillment(
      fulfillmentOrderId,
      sellerUserId,
      0,
    );

    const cancelled = await fulfillmentsService.cancelSellerFulfillment(
      fulfillmentOrderId,
      sellerUserId,
      [{ fulfillmentLineId, quantity: 3 }],
      'partial change of mind',
      sellerUserId,
      randomUUID(),
    );
    const line = cancelled.lines.find((l) => l.id === fulfillmentLineId)!;
    expect(line.cancelledQuantity).toBe(3);
    expect(line.allocatedQuantity - line.cancelledQuantity).toBe(5);
    // pickedQuantity was already fully set at acceptance and never shrinks,
    // so it still covers (and outranks, in deriveFulfillmentStatus's
    // priority order) the smaller remaining active quantity — PICKED, not
    // PARTIALLY_CANCELLED.
    expect(cancelled.status).toBe('PICKED');
  });

  it('does not let concurrent pack requests over-consume quantity', async () => {
    const { fulfillmentOrderId, fulfillmentLineId, sellerUserId } =
      await createSellerFulfillment(10);
    await fulfillmentsService.acceptSellerFulfillment(
      fulfillmentOrderId,
      sellerUserId,
      0,
    );

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        fulfillmentsService.recordSellerPack(
          fulfillmentOrderId,
          sellerUserId,
          [{ fulfillmentLineId, quantity: 3 }],
          sellerUserId,
          randomUUID(),
        ),
      ),
    );

    const succeeded = attempts.filter((a) => a.status === 'fulfilled');
    // ceil(10/3) = 4 can succeed before the 5th would over-pack; regardless
    // of exact count, the line's packedQuantity must never exceed allocated.
    expect(succeeded.length).toBeLessThanOrEqual(4);
    const line = await prisma.fulfillmentLine.findUniqueOrThrow({
      where: { id: fulfillmentLineId },
    });
    expect(line.packedQuantity).toBeLessThanOrEqual(10);
  });
});
