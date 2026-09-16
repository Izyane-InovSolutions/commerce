import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { GoodsReceiptStatus, PurchaseOrderStatus, Role } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../../infrastructure/jobs/outbox.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryService } from '../../inventory/inventory.service';
import { NumberingService } from '../numbering.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { GoodsReceiptsService } from './goods-receipts.service';

function buildTx(): {
  goodsReceipt: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  goodsReceiptLine: {
    create: jest.Mock;
    update: jest.Mock;
  };
  $queryRaw: jest.Mock;
} {
  return {
    goodsReceipt: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    goodsReceiptLine: {
      create: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]),
  };
}

function buildPrisma(): {
  goodsReceipt: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  $transaction: jest.Mock;
  tx: ReturnType<typeof buildTx>;
} {
  const tx = buildTx();
  return {
    goodsReceipt: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(
      (arg: ((client: typeof tx) => unknown) | Promise<unknown>[]) =>
        Array.isArray(arg) ? Promise.all(arg) : arg(tx),
    ),
    tx,
  };
}

const PO_LINE = {
  id: 'pol-1',
  variantId: 'v1',
  orderedQuantity: 10,
  receivedQuantity: 0,
  cancelledQuantity: 0,
  packSize: 1,
};

function buildPo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'po-1',
    poNumber: 'PO-2026-000001',
    supplierId: 'sup-1',
    warehouseId: 'wh-1',
    status: PurchaseOrderStatus.ORDERED,
    lines: [PO_LINE],
    ...overrides,
  };
}

describe('GoodsReceiptsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let purchaseOrdersService: {
    findById: jest.Mock;
    lockForReceiving: jest.Mock;
    applyReceivedQuantities: jest.Mock;
    lockRow: jest.Mock;
    reverseReceivedQuantities: jest.Mock;
  };
  let inventoryService: {
    receiveStockForReference: jest.Mock;
    reverseReceiptStock: jest.Mock;
  };
  let numberingService: { nextGoodsReceiptNumber: jest.Mock };
  let auditService: { record: jest.Mock };
  let outboxService: { record: jest.Mock };
  let service: GoodsReceiptsService;

  beforeEach(() => {
    prisma = buildPrisma();
    purchaseOrdersService = {
      findById: jest.fn().mockResolvedValue(buildPo()),
      lockForReceiving: jest.fn().mockResolvedValue(buildPo()),
      applyReceivedQuantities: jest
        .fn()
        .mockResolvedValue(PurchaseOrderStatus.PARTIALLY_RECEIVED),
      lockRow: jest.fn().mockResolvedValue(buildPo()),
      reverseReceivedQuantities: jest
        .fn()
        .mockResolvedValue(PurchaseOrderStatus.ORDERED),
    };
    inventoryService = {
      receiveStockForReference: jest
        .fn()
        .mockResolvedValue({ record: {}, movement: { id: 'mv-1' } }),
      reverseReceiptStock: jest
        .fn()
        .mockResolvedValue({ record: {}, movement: { id: 'mv-2' } }),
    };
    numberingService = {
      nextGoodsReceiptNumber: jest.fn().mockResolvedValue('GR-2026-000001'),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    outboxService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new GoodsReceiptsService(
      prisma as unknown as PrismaService,
      purchaseOrdersService as unknown as PurchaseOrdersService,
      inventoryService as unknown as InventoryService,
      numberingService as unknown as NumberingService,
      auditService as unknown as AuditService,
      outboxService as unknown as OutboxService,
    );
  });

  describe('createAndMaybePost', () => {
    it('rejects a line where delivered does not equal accepted + rejected + damaged', async () => {
      await expect(
        service.createAndMaybePost(
          'po-1',
          {
            warehouseId: 'wh-1',
            lines: [
              { purchaseOrderLineId: 'pol-1', deliveredQuantity: 10, acceptedQuantity: 5 },
            ],
          } as never,
          'user-1',
          Role.STAFF,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a non-admin authorizing an over-receipt', async () => {
      await expect(
        service.createAndMaybePost(
          'po-1',
          {
            warehouseId: 'wh-1',
            lines: [
              {
                purchaseOrderLineId: 'pol-1',
                deliveredQuantity: 12,
                acceptedQuantity: 12,
                authorizedExcessQty: 2,
              },
            ],
          } as never,
          'user-1',
          Role.STAFF,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a receipt line for a PO line that is not on this purchase order', async () => {
      await expect(
        service.createAndMaybePost(
          'po-1',
          {
            warehouseId: 'wh-1',
            lines: [
              { purchaseOrderLineId: 'not-a-line', deliveredQuantity: 1, acceptedQuantity: 1 },
            ],
          } as never,
          'user-1',
          Role.STAFF,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('post', () => {
    it('replays an already-posted receipt instead of posting twice', async () => {
      const posted = { id: 'gr-1', status: GoodsReceiptStatus.POSTED, lines: [] };
      prisma.tx.goodsReceipt.findUnique.mockResolvedValue(posted);

      const result = await service.post('gr-1', 'user-1', Role.STAFF);

      expect(result).toBe(posted);
      expect(purchaseOrdersService.lockForReceiving).not.toHaveBeenCalled();
    });

    it('refuses to post a reversed receipt', async () => {
      prisma.tx.goodsReceipt.findUnique.mockResolvedValue({
        id: 'gr-1',
        status: GoodsReceiptStatus.REVERSED,
        lines: [],
      });

      await expect(service.post('gr-1', 'user-1', Role.STAFF)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects accepted quantity beyond outstanding without authorization', async () => {
      prisma.tx.goodsReceipt.findUnique.mockResolvedValue({
        id: 'gr-1',
        status: GoodsReceiptStatus.DRAFT,
        purchaseOrderId: 'po-1',
        warehouseId: 'wh-1',
        supplierDeliveryNoteRef: null,
        lines: [
          {
            id: 'grl-1',
            purchaseOrderLineId: 'pol-1',
            deliveredQuantity: 15,
            acceptedQuantity: 15,
            rejectedQuantity: 0,
            damagedQuantity: 0,
            authorizedExcessQty: 0,
          },
        ],
      });

      await expect(service.post('gr-1', 'user-1', Role.STAFF)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(inventoryService.receiveStockForReference).not.toHaveBeenCalled();
    });

    it('posts stock, rolls the PO forward, and records audit + outbox events', async () => {
      prisma.tx.goodsReceipt.findUnique.mockResolvedValue({
        id: 'gr-1',
        status: GoodsReceiptStatus.DRAFT,
        purchaseOrderId: 'po-1',
        warehouseId: 'wh-1',
        supplierDeliveryNoteRef: 'DN-1',
        idempotencyKey: null,
        lines: [
          {
            id: 'grl-1',
            purchaseOrderLineId: 'pol-1',
            deliveredQuantity: 4,
            acceptedQuantity: 4,
            rejectedQuantity: 0,
            damagedQuantity: 0,
            authorizedExcessQty: 0,
          },
        ],
      });
      prisma.tx.goodsReceipt.update.mockResolvedValue({
        id: 'gr-1',
        status: GoodsReceiptStatus.POSTED,
        receiptNumber: 'GR-2026-000001',
        lines: [],
      });

      const result = await service.post('gr-1', 'user-1', Role.STAFF);

      expect(inventoryService.receiveStockForReference).toHaveBeenCalledWith(
        prisma.tx,
        'wh-1',
        'v1',
        4,
        { referenceType: 'goods_receipt_line', referenceId: 'grl-1' },
        'DN-1',
      );
      expect(purchaseOrdersService.applyReceivedQuantities).toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'procurement.goods_receipt.posted' }),
        prisma.tx,
      );
      expect(outboxService.record).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'procurement.receipt.posted' }),
        prisma.tx,
      );
      expect(result.status).toBe(GoodsReceiptStatus.POSTED);
    });

    it('converts accepted purchasing-unit quantity to inventory units via packSize', async () => {
      purchaseOrdersService.lockForReceiving.mockResolvedValue(
        buildPo({ lines: [{ ...PO_LINE, packSize: 12 }] }),
      );
      prisma.tx.goodsReceipt.findUnique.mockResolvedValue({
        id: 'gr-1',
        status: GoodsReceiptStatus.DRAFT,
        purchaseOrderId: 'po-1',
        warehouseId: 'wh-1',
        supplierDeliveryNoteRef: null,
        idempotencyKey: null,
        lines: [
          {
            id: 'grl-1',
            purchaseOrderLineId: 'pol-1',
            deliveredQuantity: 3,
            acceptedQuantity: 3,
            rejectedQuantity: 0,
            damagedQuantity: 0,
            authorizedExcessQty: 0,
          },
        ],
      });
      prisma.tx.goodsReceipt.update.mockResolvedValue({
        id: 'gr-1',
        status: GoodsReceiptStatus.POSTED,
        receiptNumber: 'GR-2026-000001',
        lines: [],
      });

      await service.post('gr-1', 'user-1', Role.STAFF);

      // 3 cases at packSize 12 -> 36 inventory units, not 3.
      expect(inventoryService.receiveStockForReference).toHaveBeenCalledWith(
        prisma.tx,
        'wh-1',
        'v1',
        36,
        expect.anything(),
        undefined,
      );
    });

    it('rejects a receipt with two lines for the same PO line', async () => {
      prisma.tx.goodsReceipt.findUnique.mockResolvedValue({
        id: 'gr-1',
        status: GoodsReceiptStatus.DRAFT,
        purchaseOrderId: 'po-1',
        warehouseId: 'wh-1',
        supplierDeliveryNoteRef: null,
        lines: [
          {
            id: 'grl-1',
            purchaseOrderLineId: 'pol-1',
            deliveredQuantity: 5,
            acceptedQuantity: 5,
            rejectedQuantity: 0,
            damagedQuantity: 0,
            authorizedExcessQty: 0,
          },
          {
            id: 'grl-2',
            purchaseOrderLineId: 'pol-1',
            deliveredQuantity: 5,
            acceptedQuantity: 5,
            rejectedQuantity: 0,
            damagedQuantity: 0,
            authorizedExcessQty: 0,
          },
        ],
      });

      await expect(service.post('gr-1', 'user-1', Role.STAFF)).rejects.toBeInstanceOf(
        ConflictException,
      );
      // Neither line's stock movement should have been posted before the
      // duplicate was caught, and the combined 5+5 against an outstanding
      // quantity of 10 must never both silently pass.
      expect(inventoryService.receiveStockForReference).toHaveBeenCalledTimes(1);
    });

    it('requires a discrepancy reason for a rejected quantity', async () => {
      prisma.tx.goodsReceipt.findUnique.mockResolvedValue({
        id: 'gr-1',
        status: GoodsReceiptStatus.DRAFT,
        purchaseOrderId: 'po-1',
        warehouseId: 'wh-1',
        supplierDeliveryNoteRef: null,
        lines: [
          {
            id: 'grl-1',
            purchaseOrderLineId: 'pol-1',
            deliveredQuantity: 5,
            acceptedQuantity: 3,
            rejectedQuantity: 2,
            damagedQuantity: 0,
            authorizedExcessQty: 0,
            discrepancyReason: null,
          },
        ],
      });

      await expect(service.post('gr-1', 'user-1', Role.STAFF)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('reverse', () => {
    it('marks the original receipt REVERSED and creates a posted reversal receipt', async () => {
      prisma.tx.goodsReceipt.findUnique.mockResolvedValue({
        id: 'gr-1',
        status: GoodsReceiptStatus.POSTED,
        purchaseOrderId: 'po-1',
        warehouseId: 'wh-1',
        receiptNumber: 'GR-2026-000001',
        lines: [
          {
            id: 'grl-1',
            purchaseOrderLineId: 'pol-1',
            acceptedQuantity: 4,
          },
        ],
      });
      prisma.tx.goodsReceipt.findFirst.mockResolvedValue(null);
      prisma.tx.goodsReceipt.create.mockResolvedValue({ id: 'gr-2' });
      prisma.tx.goodsReceiptLine.create.mockResolvedValue({ id: 'grl-2' });
      prisma.tx.goodsReceipt.findUniqueOrThrow.mockResolvedValue({
        id: 'gr-2',
        status: GoodsReceiptStatus.POSTED,
        reversalOfId: 'gr-1',
        lines: [],
      });

      await service.reverse('gr-1', 'damaged in transit', 'user-1');

      expect(prisma.tx.goodsReceipt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gr-1' },
          data: expect.objectContaining({
            status: GoodsReceiptStatus.REVERSED,
            reversedByUserId: 'user-1',
          }) as object,
        }),
      );
    });
  });
});
