import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';

import { OutboxService } from '../src/infrastructure/jobs/outbox.service';
import { BackgroundJobsService } from '../src/infrastructure/jobs/background-jobs.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { PrismaService } from '../src/database/prisma.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { WarehousesService } from '../src/modules/inventory/warehouses/warehouses.service';
import { GoodsReceiptsService } from '../src/modules/procurement/goods-receipts/goods-receipts.service';
import { NumberingService } from '../src/common/numbering/numbering.service';
import { PurchaseOrdersService } from '../src/modules/procurement/purchase-orders/purchase-orders.service';
import { SuppliersService } from '../src/modules/procurement/suppliers/suppliers.service';

/**
 * Exercises procurement against a real, migrated Postgres database — the
 * mocked-Prisma unit specs prove the application logic, but only a real
 * database can prove the migration actually created the constraints the
 * logic relies on (the goods_receipt_lines unique index in particular) and
 * that `SELECT ... FOR UPDATE` really does serialize concurrent receiving.
 *
 * Services are wired up directly (no Nest module bootstrap, no HTTP layer)
 * so the test controls transaction interleaving precisely. Requires
 * DATABASE_URL (see .env) to point at a database with migrations applied —
 * run `npm run prisma:deploy` first if starting from an empty database.
 */
describe('Procurement (integration, real Postgres)', () => {
  const prisma = new PrismaService();
  const auditService = new AuditService(prisma);
  const outboxService = new OutboxService(prisma);
  const warehousesService = new WarehousesService(prisma);
  const suppliersService = new SuppliersService(prisma, auditService);
  const numberingService = new NumberingService();
  const backgroundJobsServiceStub = {
    enqueue: jest.fn().mockResolvedValue(undefined),
  } as unknown as BackgroundJobsService;
  const inventoryService = new InventoryService(
    prisma,
    backgroundJobsServiceStub,
  );
  const purchaseOrdersService = new PurchaseOrdersService(
    prisma,
    suppliersService,
    warehousesService,
    numberingService,
    auditService,
    outboxService,
  );
  const goodsReceiptsService = new GoodsReceiptsService(
    prisma,
    purchaseOrdersService,
    inventoryService,
    numberingService,
    auditService,
    outboxService,
  );

  const actorUserId = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  let warehouseId: string;
  let supplierId: string;
  let variantId: string;
  let productId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const product = await prisma.product.create({
      data: {
        name: `Integration Product ${suffix}`,
        slug: `integration-product-${suffix}`,
      },
    });
    productId = product.id;

    const variant = await prisma.productVariant.create({
      data: { productId, skuCode: `INTEG-SKU-${suffix}` },
    });
    variantId = variant.id;

    const warehouse = await prisma.warehouse.create({
      data: {
        name: `Integration Warehouse ${suffix}`,
        code: `INTEG-WH-${suffix}`,
      },
    });
    warehouseId = warehouse.id;

    const supplier = await suppliersService.create(
      {
        code: `INTEG-SUP-${suffix}`,
        legalName: `Integration Supplier ${suffix}`,
      } as never,
      actorUserId,
    );
    supplierId = supplier.id;
  });

  afterAll(async () => {
    // Deleted in FK-safe order: receipts (cascades their lines) before POs
    // (cascades PO lines) before the supplier/warehouse/variant they
    // reference (each of which cascades InventoryRecord/InventoryMovement).
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: { supplierId },
      select: { id: true },
    });
    const poIds = purchaseOrders.map((po) => po.id);
    if (poIds.length) {
      await prisma.goodsReceipt.deleteMany({
        where: { purchaseOrderId: { in: poIds } },
      });
      await prisma.purchaseOrder.deleteMany({ where: { id: { in: poIds } } });
    }
    await prisma.auditEvent.deleteMany({ where: { actorUserId } });
    await prisma.supplier.deleteMany({ where: { id: supplierId } });
    await prisma.reservation.deleteMany({
      where: { inventoryRecord: { warehouseId } },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { inventoryRecord: { warehouseId } },
    });
    await prisma.inventoryRecord.deleteMany({ where: { warehouseId } });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await prisma.productVariant.deleteMany({ where: { id: variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });

    await prisma.$disconnect();
  });

  async function createOrderedPo(orderedQuantity: number): Promise<{
    poId: string;
    poLineId: string;
  }> {
    const po = await purchaseOrdersService.create(
      {
        supplierId,
        warehouseId,
        currency: 'ZMW',
        lines: [{ variantId, orderedQuantity, unitCostAmount: 1_000 }],
      } as never,
      actorUserId,
    );
    await purchaseOrdersService.submit(po.id, 0, randomUUID());
    const approverId = randomUUID();
    await purchaseOrdersService.approve(po.id, 1, approverId);
    const placed = await purchaseOrdersService.place(po.id, 2, actorUserId);
    const [line] = placed.lines;
    if (!line)
      throw new Error('expected the created purchase order to have a line');
    return { poId: placed.id, poLineId: line.id };
  }

  it('applies a migrated schema: the goods_receipt_lines unique index is enforced by Postgres itself', async () => {
    const { poId, poLineId } = await createOrderedPo(10);
    const receipt = await prisma.goodsReceipt.create({
      data: {
        receiptNumber: `GR-TEST-${randomUUID()}`,
        purchaseOrderId: poId,
        warehouseId,
        receivedByUserId: actorUserId,
      },
    });

    await prisma.goodsReceiptLine.create({
      data: {
        goodsReceiptId: receipt.id,
        purchaseOrderLineId: poLineId,
        deliveredQuantity: 1,
        acceptedQuantity: 1,
      },
    });

    // A second line for the same (receipt, PO line) pair must be rejected by
    // the database's own unique index, not merely by application code.
    await expect(
      prisma.goodsReceiptLine.create({
        data: {
          goodsReceiptId: receipt.id,
          purchaseOrderLineId: poLineId,
          deliveredQuantity: 1,
          acceptedQuantity: 1,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('posts a receipt end to end: inventory increases by accepted quantity, the PO line advances, and the PO completes', async () => {
    const { poId, poLineId } = await createOrderedPo(5);

    const posted = await goodsReceiptsService.createAndMaybePost(
      poId,
      {
        warehouseId,
        lines: [
          {
            purchaseOrderLineId: poLineId,
            deliveredQuantity: 5,
            acceptedQuantity: 5,
          },
        ],
      } as never,
      actorUserId,
      Role.STAFF,
    );

    expect(posted.status).toBe('POSTED');

    const record = await prisma.inventoryRecord.findUnique({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    expect(record?.onHand).toBe(5);

    const poLine = await prisma.purchaseOrderLine.findUniqueOrThrow({
      where: { id: poLineId },
    });
    expect(poLine.receivedQuantity).toBe(5);

    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: poId },
    });
    expect(po.status).toBe('RECEIVED');

    const movement = await prisma.inventoryMovement.findFirst({
      where: { referenceType: 'goods_receipt_line' },
      orderBy: { createdAt: 'desc' },
    });
    expect(movement?.quantity).toBe(5);
  });

  it('is idempotent: posting the same receipt id twice never adds stock twice', async () => {
    const { poId, poLineId } = await createOrderedPo(4);

    const draft = await goodsReceiptsService.createAndMaybePost(
      poId,
      {
        warehouseId,
        post: false,
        lines: [
          {
            purchaseOrderLineId: poLineId,
            deliveredQuantity: 4,
            acceptedQuantity: 4,
          },
        ],
      } as never,
      actorUserId,
      Role.STAFF,
    );

    const key = randomUUID();
    await goodsReceiptsService.post(draft.id, actorUserId, Role.STAFF, key);
    const afterFirst = await prisma.inventoryRecord.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });

    // Replaying the exact same receipt id (as a client retry after a lost
    // response would) must be a no-op, not a second increment.
    const replay = await goodsReceiptsService.post(
      draft.id,
      actorUserId,
      Role.STAFF,
      key,
    );
    const afterReplay = await prisma.inventoryRecord.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });

    expect(replay.status).toBe('POSTED');
    expect(afterReplay.onHand).toBe(afterFirst.onHand);
  });

  it('reverses once, replays the same reversal, and rejects reversal of the reversal', async () => {
    const { poId, poLineId } = await createOrderedPo(3);
    const before = await prisma.inventoryRecord.findUnique({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    const posted = await goodsReceiptsService.createAndMaybePost(
      poId,
      {
        warehouseId,
        lines: [
          {
            purchaseOrderLineId: poLineId,
            deliveredQuantity: 3,
            acceptedQuantity: 3,
          },
        ],
      } as never,
      actorUserId,
      Role.STAFF,
    );

    const first = await goodsReceiptsService.reverse(
      posted.id,
      'wrong delivery',
      actorUserId,
    );
    const replay = await goodsReceiptsService.reverse(
      posted.id,
      'retry after lost response',
      actorUserId,
    );

    expect(first.id).toBe(replay.id);
    expect(first.reversalOfId).toBe(posted.id);
    await expect(
      goodsReceiptsService.reverse(first.id, 'reverse twice', actorUserId),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      prisma.goodsReceipt.update({
        where: { id: first.id },
        data: { status: 'REVERSED' },
      }),
    ).rejects.toThrow();
    const stock = await prisma.inventoryRecord.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    expect(stock.onHand).toBe(before?.onHand ?? 0);
    const poLine = await prisma.purchaseOrderLine.findUniqueOrThrow({
      where: { id: poLineId },
    });
    expect(poLine.receivedQuantity).toBe(0);
    await expect(
      prisma.purchaseOrderLine.update({
        where: { id: poLineId },
        data: { receivedQuantity: -1 },
      }),
    ).rejects.toThrow();
    expect(
      await prisma.inventoryMovement.count({
        where: {
          referenceType: 'goods_receipt_reversal_line',
          referenceId: { in: first.lines.map((line) => line.id) },
        },
      }),
    ).toBe(1);
  });

  it('serializes concurrent reversal requests to one stock and PO decrement', async () => {
    const { poId, poLineId } = await createOrderedPo(2);
    const before = await prisma.inventoryRecord.findUnique({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    const posted = await goodsReceiptsService.createAndMaybePost(
      poId,
      {
        warehouseId,
        lines: [
          {
            purchaseOrderLineId: poLineId,
            deliveredQuantity: 2,
            acceptedQuantity: 2,
          },
        ],
      } as never,
      actorUserId,
      Role.STAFF,
    );

    const [first, second] = await Promise.all([
      goodsReceiptsService.reverse(posted.id, 'duplicate request', actorUserId),
      goodsReceiptsService.reverse(posted.id, 'duplicate request', actorUserId),
    ]);

    expect(first.id).toBe(second.id);
    expect(
      await prisma.goodsReceipt.count({ where: { reversalOfId: posted.id } }),
    ).toBe(1);
    expect(
      (
        await prisma.inventoryRecord.findUniqueOrThrow({
          where: { warehouseId_variantId: { warehouseId, variantId } },
        })
      ).onHand,
    ).toBe(before?.onHand ?? 0);
    expect(
      (
        await prisma.purchaseOrderLine.findUniqueOrThrow({
          where: { id: poLineId },
        })
      ).receivedQuantity,
    ).toBe(0);
  });

  it('rolls back a reversal when stock is no longer available', async () => {
    const { poId, poLineId } = await createOrderedPo(3);
    const posted = await goodsReceiptsService.createAndMaybePost(
      poId,
      {
        warehouseId,
        lines: [
          {
            purchaseOrderLineId: poLineId,
            deliveredQuantity: 3,
            acceptedQuantity: 3,
          },
        ],
      } as never,
      actorUserId,
      Role.STAFF,
    );
    const stock = await prisma.inventoryRecord.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    await prisma.inventoryRecord.update({
      where: { id: stock.id },
      data: { reserved: stock.onHand - 2 },
    });

    await expect(
      goodsReceiptsService.reverse(posted.id, 'unavailable stock', actorUserId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await prisma.goodsReceipt.count({ where: { reversalOfId: posted.id } }),
    ).toBe(0);
    expect(
      (
        await prisma.purchaseOrderLine.findUniqueOrThrow({
          where: { id: poLineId },
        })
      ).receivedQuantity,
    ).toBe(3);
    expect(
      (
        await prisma.goodsReceipt.findUniqueOrThrow({
          where: { id: posted.id },
        })
      ).status,
    ).toBe('POSTED');
    await prisma.inventoryRecord.update({
      where: { id: stock.id },
      data: { reserved: 0 },
    });
  });

  it('rolls back a reversal if its PO line no longer has enough received quantity', async () => {
    const { poId, poLineId } = await createOrderedPo(2);
    const posted = await goodsReceiptsService.createAndMaybePost(
      poId,
      {
        warehouseId,
        lines: [
          {
            purchaseOrderLineId: poLineId,
            deliveredQuantity: 2,
            acceptedQuantity: 2,
          },
        ],
      } as never,
      actorUserId,
      Role.STAFF,
    );
    const stock = await prisma.inventoryRecord.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    await prisma.purchaseOrderLine.update({
      where: { id: poLineId },
      data: { receivedQuantity: 1 },
    });

    await expect(
      goodsReceiptsService.reverse(posted.id, 'quantity drift', actorUserId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      (
        await prisma.inventoryRecord.findUniqueOrThrow({
          where: { id: stock.id },
        })
      ).onHand,
    ).toBe(stock.onHand);
    expect(
      await prisma.goodsReceipt.count({ where: { reversalOfId: posted.id } }),
    ).toBe(0);
    expect(
      (
        await prisma.purchaseOrderLine.findUniqueOrThrow({
          where: { id: poLineId },
        })
      ).receivedQuantity,
    ).toBe(1);
  });

  it('keeps a deliberately closed-short purchase order closed after reversal', async () => {
    const { poId, poLineId } = await createOrderedPo(5);
    const posted = await goodsReceiptsService.createAndMaybePost(
      poId,
      {
        warehouseId,
        lines: [
          {
            purchaseOrderLineId: poLineId,
            deliveredQuantity: 2,
            acceptedQuantity: 2,
          },
        ],
      } as never,
      actorUserId,
      Role.STAFF,
    );
    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: poId },
    });
    const closed = await purchaseOrdersService.closeShort(
      poId,
      po.version,
      'remaining units unavailable',
      actorUserId,
    );

    await goodsReceiptsService.reverse(
      posted.id,
      'wrong delivery',
      actorUserId,
    );

    const after = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: poId },
      include: { lines: true },
    });
    expect(after.status).toBe('CLOSED_SHORT');
    expect(after.completedAt).toEqual(closed.completedAt);
    expect(after.shortCloseReason).toBe(closed.shortCloseReason);
    expect(after.lines[0]).toMatchObject({
      receivedQuantity: 0,
      cancelledQuantity: 3,
    });
  });

  it('serializes concurrent receiving through the PO row lock: only one of two full-outstanding receipts can win', async () => {
    const { poId, poLineId } = await createOrderedPo(10);

    const draftA = await goodsReceiptsService.createAndMaybePost(
      poId,
      {
        warehouseId,
        post: false,
        lines: [
          {
            purchaseOrderLineId: poLineId,
            deliveredQuantity: 10,
            acceptedQuantity: 10,
          },
        ],
      } as never,
      actorUserId,
      Role.STAFF,
    );
    const draftB = await goodsReceiptsService.createAndMaybePost(
      poId,
      {
        warehouseId,
        post: false,
        lines: [
          {
            purchaseOrderLineId: poLineId,
            deliveredQuantity: 10,
            acceptedQuantity: 10,
          },
        ],
      } as never,
      actorUserId,
      Role.STAFF,
    );

    // Both request the entire outstanding quantity (10) at once. Without the
    // `SELECT ... FOR UPDATE` lock in lockForReceiving, both could read
    // outstanding=10 before either commits and both would succeed,
    // double-receiving the PO.
    const results = await Promise.allSettled([
      goodsReceiptsService.post(draftA.id, actorUserId, Role.STAFF),
      goodsReceiptsService.post(draftB.id, actorUserId, Role.STAFF),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );

    const record = await prisma.inventoryRecord.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    // Only the winner's 10 units were ever added — never 20.
    expect(record.onHand).toBeGreaterThanOrEqual(10);
    const poLine = await prisma.purchaseOrderLine.findUniqueOrThrow({
      where: { id: poLineId },
    });
    expect(poLine.receivedQuantity).toBe(10);
  });
});
