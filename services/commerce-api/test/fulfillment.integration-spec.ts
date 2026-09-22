import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import { FulfillmentWorkItemType, Role, ShipmentStatus } from '@prisma/client';

import { NumberingService } from '../src/common/numbering/numbering.service';
import { PrismaService } from '../src/database/prisma.service';
import { BackgroundJobsService } from '../src/infrastructure/jobs/background-jobs.service';
import { OutboxService } from '../src/infrastructure/jobs/outbox.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { FulfillmentsService } from '../src/modules/fulfillment/fulfillments.service';
import { FulfillmentProvisioningService } from '../src/modules/fulfillment/provisioning/fulfillment-provisioning.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import type { SellersService } from '../src/modules/sellers/sellers.service';

/**
 * Exercises fulfillment provisioning, picking, packing, dispatch and
 * cancellation against a real, migrated Postgres database — see
 * test/procurement.integration-spec.ts for why this exists alongside the
 * mocked-Prisma unit specs (row locks and DB CHECK constraints can only be
 * proven against a real database).
 *
 * Dispatch requires a booked Shipment (#29, owned by a different module).
 * Rather than depend on that module's ShipmentsService — a moving target
 * developed concurrently — fixtures create Shipment/ShipmentLine rows
 * directly, simulating "already booked" the same way a real booking would
 * leave FulfillmentLine.shipmentAssignedQuantity and the Shipment row.
 */
describe('Fulfillment (integration, real Postgres)', () => {
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
  // This suite is admin/platform-path only (#37 seller commands have their
  // own dedicated suite) — a minimal stub is enough to satisfy the
  // constructor.
  const sellersServiceStub = {
    lockApproved: jest.fn(),
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
        await prisma.fulfillmentDispatch.deleteMany({
          where: { fulfillmentOrderId: { in: fulfillmentOrderIds } },
        });
      }
      await prisma.shipment.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.fulfillmentOrder.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (createdWarehouseIds.length) {
      await prisma.warehouse.deleteMany({ where: { id: { in: createdWarehouseIds } } });
    }
    if (createdProductIds.length) {
      await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    }
    await prisma.$disconnect();
  });

  /** Builds a paid, single-line PLATFORM order with a committed reservation
   * — the exact state confirmPayment leaves behind — and provisions
   * fulfillment from it, returning the fulfillment order and its one line. */
  async function createProvisionedFulfillment(
    quantity: number,
    onHand = quantity + 100,
  ): Promise<{
    fulfillmentOrderId: string;
    fulfillmentLineId: string;
    warehouseId: string;
    variantId: string;
    orderId: string;
  }> {
    const rowSuffix = `${suffix}-${randomUUID().slice(0, 8)}`;

    const user = await prisma.user.create({
      data: {
        email: `fulfillment-${rowSuffix}@example.test`,
        passwordHash: 'x',
      },
    });
    createdUserIds.push(user.id);

    const product = await prisma.product.create({
      data: { name: `Fulfillment Product ${rowSuffix}`, slug: `fulfillment-product-${rowSuffix}` },
    });
    createdProductIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, skuCode: `FUL-SKU-${rowSuffix}` },
    });
    const offer = await prisma.offer.create({ data: { variantId: variant.id } });

    const warehouse = await prisma.warehouse.create({
      data: { name: `Fulfillment Warehouse ${rowSuffix}`, code: `FUL-WH-${rowSuffix}` },
    });
    createdWarehouseIds.push(warehouse.id);

    const record = await prisma.inventoryRecord.create({
      data: { warehouseId: warehouse.id, variantId: variant.id, onHand, reserved: quantity },
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

    return {
      fulfillmentOrderId: fulfillmentOrder.id,
      fulfillmentLineId: line.id,
      warehouseId: warehouse.id,
      variantId: variant.id,
      orderId: order.id,
    };
  }

  async function startPicking(fulfillmentOrderId: string): Promise<void> {
    await fulfillmentsService.startWork(
      fulfillmentOrderId,
      FulfillmentWorkItemType.PICK,
      0,
      ADMIN_USER_ID,
      Role.ADMIN,
    );
  }

  async function startPacking(fulfillmentOrderId: string): Promise<void> {
    await fulfillmentsService.startWork(
      fulfillmentOrderId,
      FulfillmentWorkItemType.PACK,
      0,
      ADMIN_USER_ID,
      Role.ADMIN,
    );
  }

  /** Simulates #29's booking step directly: assigns packed quantity to a new
   * BOOKED Shipment/ShipmentLine, bypassing ShipmentsService entirely. */
  async function bookShipment(
    fulfillmentOrderId: string,
    fulfillmentLineId: string,
    orderId: string,
    quantity: number,
  ): Promise<string> {
    const fo = await prisma.fulfillmentOrder.findUniqueOrThrow({ where: { id: fulfillmentOrderId } });
    const line = await prisma.fulfillmentLine.findUniqueOrThrow({ where: { id: fulfillmentLineId } });
    const shipment = await prisma.shipment.create({
      data: {
        shipmentNumber: `SHIP-TEST-${randomUUID()}`,
        orderId,
        sellerOrderId: fo.sellerOrderId,
        shippingGroupId: fo.shippingGroupId,
        fulfillmentOrderId,
        warehouseId: fo.warehouseId,
        providerCode: 'ZONE',
        carrierCode: 'MANUAL',
        methodCode: 'FREE_STANDARD_V1',
        status: ShipmentStatus.BOOKED,
        bookingIdempotencyKey: randomUUID(),
        bookedAt: new Date(),
        lines: {
          create: [{ fulfillmentLineId, orderItemId: line.orderItemId, quantity }],
        },
      },
    });
    await prisma.fulfillmentLine.update({
      where: { id: fulfillmentLineId },
      data: { shipmentAssignedQuantity: { increment: quantity } },
    });
    return shipment.id;
  }

  it('provisions idempotently and resolves the warehouse from the committed reservation', async () => {
    const { fulfillmentOrderId, warehouseId } = await createProvisionedFulfillment(5);

    const before = await prisma.fulfillmentOrder.findUniqueOrThrow({
      where: { id: fulfillmentOrderId },
    });
    expect(before.warehouseId).toBe(warehouseId);

    // Replaying provisioning for the same order must not create a duplicate.
    await provisioningService.provisionForOrder(before.orderId);
    const count = await prisma.fulfillmentOrder.count({ where: { orderId: before.orderId } });
    expect(count).toBe(1);
  });

  it('supports partial picking, partial packing, and multiple partial dispatches', async () => {
    const { fulfillmentOrderId, fulfillmentLineId, warehouseId, variantId, orderId } =
      await createProvisionedFulfillment(10);

    await startPicking(fulfillmentOrderId);
    await fulfillmentsService.recordQuantities(
      fulfillmentOrderId,
      FulfillmentWorkItemType.PICK,
      [{ fulfillmentLineId, quantity: 6 }],
      ADMIN_USER_ID,
      Role.ADMIN,
      randomUUID(),
    );
    let line = await prisma.fulfillmentLine.findUniqueOrThrow({ where: { id: fulfillmentLineId } });
    expect(line.pickedQuantity).toBe(6);

    await fulfillmentsService.recordQuantities(
      fulfillmentOrderId,
      FulfillmentWorkItemType.PICK,
      [{ fulfillmentLineId, quantity: 4 }],
      ADMIN_USER_ID,
      Role.ADMIN,
      randomUUID(),
    );

    await startPacking(fulfillmentOrderId);
    await fulfillmentsService.recordQuantities(
      fulfillmentOrderId,
      FulfillmentWorkItemType.PACK,
      [{ fulfillmentLineId, quantity: 10 }],
      ADMIN_USER_ID,
      Role.ADMIN,
      randomUUID(),
    );
    line = await prisma.fulfillmentLine.findUniqueOrThrow({ where: { id: fulfillmentLineId } });
    expect(line.packedQuantity).toBe(10);

    const shipmentA = await bookShipment(fulfillmentOrderId, fulfillmentLineId, orderId, 7);
    await fulfillmentsService.dispatch(fulfillmentOrderId, shipmentA, ADMIN_USER_ID, randomUUID());
    const shipmentB = await bookShipment(fulfillmentOrderId, fulfillmentLineId, orderId, 3);
    await fulfillmentsService.dispatch(fulfillmentOrderId, shipmentB, ADMIN_USER_ID, randomUUID());

    line = await prisma.fulfillmentLine.findUniqueOrThrow({ where: { id: fulfillmentLineId } });
    expect(line.dispatchedQuantity).toBe(10);
    const fo = await prisma.fulfillmentOrder.findUniqueOrThrow({ where: { id: fulfillmentOrderId } });
    expect(fo.status).toBe('DISPATCHED');

    const record = await prisma.inventoryRecord.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    // Picking/packing/dispatch never touch inventory — only the original
    // reservation commit (already reflected in `reserved`/`onHand` by the
    // fixture) and cancellation do.
    expect(record.onHand).toBeGreaterThanOrEqual(0);
  });

  it('rejects a dispatch quantity that exceeds what was assigned to the shipment', async () => {
    const { fulfillmentOrderId, fulfillmentLineId, orderId } = await createProvisionedFulfillment(5);
    await startPicking(fulfillmentOrderId);
    await fulfillmentsService.recordQuantities(
      fulfillmentOrderId,
      FulfillmentWorkItemType.PICK,
      [{ fulfillmentLineId, quantity: 5 }],
      ADMIN_USER_ID,
      Role.ADMIN,
      randomUUID(),
    );
    await startPacking(fulfillmentOrderId);
    await fulfillmentsService.recordQuantities(
      fulfillmentOrderId,
      FulfillmentWorkItemType.PACK,
      [{ fulfillmentLineId, quantity: 5 }],
      ADMIN_USER_ID,
      Role.ADMIN,
      randomUUID(),
    );

    // Book only 2, but the ShipmentLine below (created directly, bypassing
    // the assignment bookkeeping) claims to carry all 5.
    const fo = await prisma.fulfillmentOrder.findUniqueOrThrow({ where: { id: fulfillmentOrderId } });
    const line = await prisma.fulfillmentLine.findUniqueOrThrow({ where: { id: fulfillmentLineId } });
    const shipment = await prisma.shipment.create({
      data: {
        shipmentNumber: `SHIP-TEST-${randomUUID()}`,
        orderId,
        sellerOrderId: fo.sellerOrderId,
        shippingGroupId: fo.shippingGroupId,
        fulfillmentOrderId,
        warehouseId: fo.warehouseId,
        providerCode: 'ZONE',
        carrierCode: 'MANUAL',
        methodCode: 'FREE_STANDARD_V1',
        status: ShipmentStatus.BOOKED,
        bookingIdempotencyKey: randomUUID(),
        bookedAt: new Date(),
        lines: {
          create: [{ fulfillmentLineId, orderItemId: line.orderItemId, quantity: 5 }],
        },
      },
    });
    await prisma.fulfillmentLine.update({
      where: { id: fulfillmentLineId },
      data: { shipmentAssignedQuantity: 2 },
    });

    await expect(
      fulfillmentsService.dispatch(fulfillmentOrderId, shipment.id, ADMIN_USER_ID, randomUUID()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('serializes concurrent picking through the fulfillment-order row lock', async () => {
    const { fulfillmentOrderId, fulfillmentLineId } = await createProvisionedFulfillment(10);
    await startPicking(fulfillmentOrderId);

    const results = await Promise.allSettled([
      fulfillmentsService.recordQuantities(
        fulfillmentOrderId,
        FulfillmentWorkItemType.PICK,
        [{ fulfillmentLineId, quantity: 6 }],
        ADMIN_USER_ID,
        Role.ADMIN,
        randomUUID(),
      ),
      fulfillmentsService.recordQuantities(
        fulfillmentOrderId,
        FulfillmentWorkItemType.PICK,
        [{ fulfillmentLineId, quantity: 6 }],
        ADMIN_USER_ID,
        Role.ADMIN,
        randomUUID(),
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const line = await prisma.fulfillmentLine.findUniqueOrThrow({ where: { id: fulfillmentLineId } });
    expect(line.pickedQuantity).toBe(6);
  });

  it('rolls back the whole request when one of several lines fails validation', async () => {
    const { fulfillmentOrderId, fulfillmentLineId } = await createProvisionedFulfillment(5);
    await startPicking(fulfillmentOrderId);

    await expect(
      fulfillmentsService.recordQuantities(
        fulfillmentOrderId,
        FulfillmentWorkItemType.PICK,
        [
          { fulfillmentLineId, quantity: 3 },
          { fulfillmentLineId: 'not-a-real-line', quantity: 1 },
        ],
        ADMIN_USER_ID,
        Role.ADMIN,
        randomUUID(),
      ),
    ).rejects.toThrow();

    const line = await prisma.fulfillmentLine.findUniqueOrThrow({ where: { id: fulfillmentLineId } });
    expect(line.pickedQuantity).toBe(0);
  });

  it('restores inventory exactly once even if the same cancellation is retried', async () => {
    const { fulfillmentOrderId, fulfillmentLineId, warehouseId, variantId } =
      await createProvisionedFulfillment(5);
    const before = await prisma.inventoryRecord.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });

    const key = randomUUID();
    await fulfillmentsService.cancel(
      fulfillmentOrderId,
      { lines: [{ fulfillmentLineId, quantity: 5 }], reason: 'customer requested cancellation' },
      ADMIN_USER_ID,
      key,
    );
    const afterFirst = await prisma.inventoryRecord.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    expect(afterFirst.onHand).toBe(before.onHand + 5);

    await fulfillmentsService.cancel(
      fulfillmentOrderId,
      { lines: [{ fulfillmentLineId, quantity: 5 }], reason: 'customer requested cancellation' },
      ADMIN_USER_ID,
      key,
    );
    const afterReplay = await prisma.inventoryRecord.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    expect(afterReplay.onHand).toBe(afterFirst.onHand);

    const fo = await prisma.fulfillmentOrder.findUniqueOrThrow({ where: { id: fulfillmentOrderId } });
    expect(fo.status).toBe('CANCELLED');
  });

  it('enforces the quantity-chain CHECK constraint at the database level', async () => {
    const { fulfillmentLineId } = await createProvisionedFulfillment(5);

    // Bypasses the service layer entirely: picked (10) must never exceed
    // allocated (5) — the DB constraint must reject this even though no
    // application code ran to stop it.
    await expect(
      prisma.$executeRaw`UPDATE fulfillment_lines SET picked_quantity = 10 WHERE id = ${fulfillmentLineId}::uuid`,
    ).rejects.toThrow();
  });
});
