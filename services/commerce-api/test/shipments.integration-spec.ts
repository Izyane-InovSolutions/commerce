import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import {
  FulfillmentWorkItemType,
  Role,
  ShipmentStatus,
  TrackingEventSource,
} from '@prisma/client';

import { NumberingService } from '../src/common/numbering/numbering.service';
import { PrismaService } from '../src/database/prisma.service';
import { BackgroundJobsService } from '../src/infrastructure/jobs/background-jobs.service';
import { OutboxService } from '../src/infrastructure/jobs/outbox.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { FulfillmentsService } from '../src/modules/fulfillment/fulfillments.service';
import { FulfillmentProvisioningService } from '../src/modules/fulfillment/provisioning/fulfillment-provisioning.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { CarrierProviderRegistry } from '../src/modules/shipments/carrier-provider.registry';
import { ManualCarrierProvider } from '../src/modules/shipments/providers/manual-carrier.provider';
import { ShipmentsService } from '../src/modules/shipments/shipments.service';

/**
 * Exercises shipment booking, cancellation, webhook dedup and tracking
 * projection against a real, migrated Postgres database — see
 * test/procurement.integration-spec.ts for why this exists alongside the
 * mocked-Prisma unit specs.
 */
describe('Shipments (integration, real Postgres)', () => {
  const prisma = new PrismaService();
  const auditService = new AuditService(prisma);
  const outboxService = new OutboxService(prisma);
  const numberingService = new NumberingService();
  const backgroundJobsServiceStub = {
    enqueue: jest.fn().mockResolvedValue(undefined),
  } as unknown as BackgroundJobsService;
  const inventoryService = new InventoryService(prisma, backgroundJobsServiceStub);
  const provisioningService = new FulfillmentProvisioningService(
    prisma,
    numberingService,
    auditService,
    outboxService,
  );
  const fulfillmentsService = new FulfillmentsService(
    prisma,
    inventoryService,
    numberingService,
    auditService,
    outboxService,
  );
  const carrierProviderRegistry = new CarrierProviderRegistry([new ManualCarrierProvider()]);
  const shipmentsService = new ShipmentsService(
    prisma,
    fulfillmentsService,
    numberingService,
    carrierProviderRegistry,
    auditService,
    outboxService,
  );

  const suffix = randomUUID().slice(0, 8);
  const ADMIN_USER_ID = randomUUID();
  const createdProductIds: string[] = [];
  const createdWarehouseIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdOrderIds.length) {
      const fulfillmentOrders = await prisma.fulfillmentOrder.findMany({
        where: { orderId: { in: createdOrderIds } },
        select: { id: true },
      });
      const fulfillmentOrderIds = fulfillmentOrders.map((fo) => fo.id);
      if (fulfillmentOrderIds.length) {
        await prisma.trackingEvent.deleteMany({
          where: { shipment: { fulfillmentOrderId: { in: fulfillmentOrderIds } } },
        });
        await prisma.fulfillmentDispatch.deleteMany({
          where: { fulfillmentOrderId: { in: fulfillmentOrderIds } },
        });
        await prisma.shipment.deleteMany({ where: { fulfillmentOrderId: { in: fulfillmentOrderIds } } });
      }
      await prisma.fulfillmentOrder.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    if (createdWarehouseIds.length) {
      await prisma.warehouse.deleteMany({ where: { id: { in: createdWarehouseIds } } });
    }
    if (createdProductIds.length) await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });

    await prisma.$disconnect();
  });

  /** Builds a paid, single-line PLATFORM order through to fully-packed
   * fulfillment — the state a shipment can be booked against. */
  async function createPackedFulfillment(
    quantity: number,
  ): Promise<{ fulfillmentOrderId: string; fulfillmentLineId: string; orderId: string }> {
    const rowSuffix = `${suffix}-${randomUUID().slice(0, 8)}`;

    const user = await prisma.user.create({
      data: { email: `shipments-${rowSuffix}@example.test`, passwordHash: 'x' },
    });
    createdUserIds.push(user.id);

    const product = await prisma.product.create({
      data: { name: `Shipments Product ${rowSuffix}`, slug: `shipments-product-${rowSuffix}` },
    });
    createdProductIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, skuCode: `SHIP-SKU-${rowSuffix}` },
    });
    const offer = await prisma.offer.create({ data: { variantId: variant.id } });

    const warehouse = await prisma.warehouse.create({
      data: { name: `Shipments Warehouse ${rowSuffix}`, code: `SHIP-WH-${rowSuffix}` },
    });
    createdWarehouseIds.push(warehouse.id);

    const record = await prisma.inventoryRecord.create({
      data: { warehouseId: warehouse.id, variantId: variant.id, onHand: quantity + 100, reserved: quantity },
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
        userId: user.id,
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
        fulfillmentMode: 'PLATFORM',
        serviceLevel: 'STANDARD',
        rateCode: 'FREE_STANDARD_V1',
        methodCode: 'FREE_STANDARD_V1',
        methodName: 'Standard shipping',
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

    const fulfillmentOrder = await prisma.fulfillmentOrder.findUniqueOrThrow({
      where: { shippingGroupId_warehouseId: { shippingGroupId: shippingGroup.id, warehouseId: warehouse.id } },
      include: { lines: true },
    });
    const [line] = fulfillmentOrder.lines;
    if (!line) throw new Error('expected a provisioned fulfillment line');

    await fulfillmentsService.startWork(fulfillmentOrder.id, FulfillmentWorkItemType.PICK, 0, ADMIN_USER_ID, Role.ADMIN);
    await fulfillmentsService.recordQuantities(
      fulfillmentOrder.id,
      FulfillmentWorkItemType.PICK,
      [{ fulfillmentLineId: line.id, quantity }],
      ADMIN_USER_ID,
      Role.ADMIN,
      randomUUID(),
    );
    await fulfillmentsService.startWork(fulfillmentOrder.id, FulfillmentWorkItemType.PACK, 0, ADMIN_USER_ID, Role.ADMIN);
    await fulfillmentsService.recordQuantities(
      fulfillmentOrder.id,
      FulfillmentWorkItemType.PACK,
      [{ fulfillmentLineId: line.id, quantity }],
      ADMIN_USER_ID,
      Role.ADMIN,
      randomUUID(),
    );

    return { fulfillmentOrderId: fulfillmentOrder.id, fulfillmentLineId: line.id, orderId: order.id };
  }

  it('books a shipment through the manual carrier and projects tracking status forward', async () => {
    const { fulfillmentOrderId, fulfillmentLineId } = await createPackedFulfillment(5);

    const shipment = await shipmentsService.create(
      {
        fulfillmentOrderId,
        lines: [{ fulfillmentLineId, quantity: 5 }],
      },
      ADMIN_USER_ID,
      randomUUID(),
    );
    expect(shipment.status).toBe(ShipmentStatus.PENDING_BOOKING);

    const line = await prisma.fulfillmentLine.findUniqueOrThrow({ where: { id: fulfillmentLineId } });
    expect(line.shipmentAssignedQuantity).toBe(5);

    const booked = await shipmentsService.book(shipment.id, ADMIN_USER_ID);
    expect(booked.status).toBe(ShipmentStatus.BOOKED);
    expect(booked.trackingReference).toBeTruthy();

    await shipmentsService.addManualTrackingEvent(
      shipment.id,
      { normalizedStatus: ShipmentStatus.IN_TRANSIT, occurredAt: new Date().toISOString() },
      ADMIN_USER_ID,
      Role.ADMIN,
    );
    const afterTransit = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(afterTransit.status).toBe(ShipmentStatus.IN_TRANSIT);

    // Delivered is terminal; an older event must not regress it.
    await shipmentsService.addManualTrackingEvent(
      shipment.id,
      { normalizedStatus: ShipmentStatus.DELIVERED, occurredAt: new Date().toISOString() },
      ADMIN_USER_ID,
      Role.ADMIN,
    );
    await shipmentsService.addManualTrackingEvent(
      shipment.id,
      {
        normalizedStatus: ShipmentStatus.OUT_FOR_DELIVERY,
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
      },
      ADMIN_USER_ID,
      Role.ADMIN,
    );
    const final = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(final.status).toBe(ShipmentStatus.DELIVERED);
  });

  it('is idempotent: creating with the same key twice never double-allocates', async () => {
    const { fulfillmentOrderId, fulfillmentLineId } = await createPackedFulfillment(4);
    const key = randomUUID();
    const dto = {
      fulfillmentOrderId,
      lines: [{ fulfillmentLineId, quantity: 4 }],
    };

    const [first, second] = await Promise.all([
      shipmentsService.create(dto, ADMIN_USER_ID, key),
      shipmentsService.create(dto, ADMIN_USER_ID, key),
    ]);
    expect(second.id).toBe(first.id);

    const line = await prisma.fulfillmentLine.findUniqueOrThrow({ where: { id: fulfillmentLineId } });
    expect(line.shipmentAssignedQuantity).toBe(4);
  });

  it('releases the allocation when a booked shipment is cancelled', async () => {
    const { fulfillmentOrderId, fulfillmentLineId } = await createPackedFulfillment(3);
    const shipment = await shipmentsService.create(
      {
        fulfillmentOrderId,
        lines: [{ fulfillmentLineId, quantity: 3 }],
      },
      ADMIN_USER_ID,
      randomUUID(),
    );
    await shipmentsService.book(shipment.id, ADMIN_USER_ID);

    await shipmentsService.cancel(shipment.id, 'customer changed their mind', ADMIN_USER_ID);

    const line = await prisma.fulfillmentLine.findUniqueOrThrow({ where: { id: fulfillmentLineId } });
    expect(line.shipmentAssignedQuantity).toBe(0);

    const cancelledShipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(cancelledShipment.status).toBe(ShipmentStatus.CANCELLED);
  });

  it('serializes concurrent booking attempts through the fulfillment-order row lock', async () => {
    const { fulfillmentOrderId, fulfillmentLineId } = await createPackedFulfillment(5);

    const results = await Promise.allSettled([
      shipmentsService.create(
        {
          fulfillmentOrderId,
          lines: [{ fulfillmentLineId, quantity: 3 }],
        },
        ADMIN_USER_ID,
        randomUUID(),
      ),
      shipmentsService.create(
        {
          fulfillmentOrderId,
          lines: [{ fulfillmentLineId, quantity: 3 }],
        },
        ADMIN_USER_ID,
        randomUUID(),
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    // 3 + 3 = 6 exceeds the 5 packed; exactly one must be rejected.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const line = await prisma.fulfillmentLine.findUniqueOrThrow({ where: { id: fulfillmentLineId } });
    expect(line.shipmentAssignedQuantity).toBe(3);
  });

  it('dedupes a retried webhook delivery for the same payload', async () => {
    const { fulfillmentOrderId, fulfillmentLineId } = await createPackedFulfillment(2);
    const shipment = await shipmentsService.create(
      {
        fulfillmentOrderId,
        lines: [{ fulfillmentLineId, quantity: 2 }],
      },
      ADMIN_USER_ID,
      randomUUID(),
    );
    const booked = await shipmentsService.book(shipment.id, ADMIN_USER_ID);

    // ManualCarrierProvider has no parseWebhook; register a stub carrier
    // under a distinct code so this test can drive ingestWebhook directly
    // without depending on a real signed carrier existing yet.
    const stubProviderCode = `STUB-${randomUUID().slice(0, 8)}`;
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { providerCode: stubProviderCode },
    });
    const occurredAt = new Date().toISOString();
    const stubProvider = {
      providerCode: stubProviderCode,
      book: jest.fn(),
      cancel: jest.fn(),
      poll: jest.fn(),
      parseWebhook: (): {
        providerDeliveryId: string;
        events: {
          trackingReference: string;
          normalizedStatus: ShipmentStatus;
          occurredAt: Date;
        }[];
      } => ({
        providerDeliveryId: 'delivery-1',
        events: [
          {
            trackingReference: booked.trackingReference!,
            normalizedStatus: ShipmentStatus.OUT_FOR_DELIVERY,
            occurredAt: new Date(occurredAt),
          },
        ],
      }),
    };
    const stubRegistry = new CarrierProviderRegistry([stubProvider]);
    const stubService = new ShipmentsService(
      prisma,
      fulfillmentsService,
      numberingService,
      stubRegistry,
      auditService,
      outboxService,
    );

    await stubService.ingestWebhook(stubProviderCode, { event: 'out_for_delivery' }, {});
    await stubService.ingestWebhook(stubProviderCode, { event: 'out_for_delivery' }, {});

    const events = await prisma.trackingEvent.findMany({
      where: { shipmentId: shipment.id, source: TrackingEventSource.CARRIER_WEBHOOK },
    });
    expect(events).toHaveLength(1);

    const afterWebhook = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(afterWebhook.status).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
  });

  it('enforces the shipment-assignment CHECK constraint at the database level', async () => {
    const { fulfillmentLineId } = await createPackedFulfillment(3);

    await expect(
      prisma.$executeRaw`UPDATE fulfillment_lines SET shipment_assigned_quantity = 999 WHERE id = ${fulfillmentLineId}::uuid`,
    ).rejects.toThrow();
  });
});
