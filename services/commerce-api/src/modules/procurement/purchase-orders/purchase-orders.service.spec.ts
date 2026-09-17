import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PurchaseOrderStatus } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../../infrastructure/jobs/outbox.service';
import { AuditService } from '../../audit/audit.service';
import { WarehousesService } from '../../inventory/warehouses/warehouses.service';
import { NumberingService } from '../../../common/numbering/numbering.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { PurchaseOrdersService } from './purchase-orders.service';

function buildTx(): {
  purchaseOrder: {
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  purchaseOrderLine: {
    deleteMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };
  $queryRaw: jest.Mock;
} {
  return {
    purchaseOrder: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    purchaseOrderLine: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]),
  };
}

function buildPrisma(): {
  purchaseOrder: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
  tx: ReturnType<typeof buildTx>;
} {
  const tx = buildTx();
  return {
    purchaseOrder: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(
      (arg: ((client: typeof tx) => unknown) | Promise<unknown>[]) =>
        Array.isArray(arg) ? Promise.all(arg) : arg(tx),
    ),
    tx,
  };
}

describe('PurchaseOrdersService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let suppliersService: { requireActive: jest.Mock };
  let warehousesService: { findById: jest.Mock };
  let numberingService: { nextPurchaseOrderNumber: jest.Mock };
  let auditService: { record: jest.Mock };
  let outboxService: { record: jest.Mock };
  let service: PurchaseOrdersService;

  beforeEach(() => {
    prisma = buildPrisma();
    suppliersService = { requireActive: jest.fn().mockResolvedValue({ id: 'sup-1' }) };
    warehousesService = {
      findById: jest.fn().mockResolvedValue({ id: 'wh-1', isActive: true }),
    };
    numberingService = {
      nextPurchaseOrderNumber: jest.fn().mockResolvedValue('PO-2026-000001'),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    outboxService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new PurchaseOrdersService(
      prisma as unknown as PrismaService,
      suppliersService as unknown as SuppliersService,
      warehousesService as unknown as WarehousesService,
      numberingService as unknown as NumberingService,
      auditService as unknown as AuditService,
      outboxService as unknown as OutboxService,
    );
  });

  describe('create', () => {
    it('computes and persists line and order totals', async () => {
      prisma.tx.purchaseOrder.create.mockResolvedValue({
        id: 'po-1',
        poNumber: 'PO-2026-000001',
        lines: [],
      });

      await service.create(
        {
          supplierId: 'sup-1',
          warehouseId: 'wh-1',
          currency: 'ZMW',
          shippingAmount: 100,
          lines: [
            {
              variantId: 'v1',
              orderedQuantity: 10,
              unitCostAmount: 500,
              discountAmount: 0,
              taxRateBasisPoints: 1_600,
            },
          ],
        } as never,
        'user-1',
      );

      expect(prisma.tx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotalAmount: 5_000,
            taxAmount: 800,
            totalAmount: 5_900,
          }) as object,
        }),
      );
    });

    it('rejects an inactive supplier before creating anything', async () => {
      suppliersService.requireActive.mockRejectedValue(
        new ConflictException('Supplier is not active'),
      );

      await expect(
        service.create(
          {
            supplierId: 'sup-1',
            warehouseId: 'wh-1',
            currency: 'ZMW',
            lines: [
              { variantId: 'v1', orderedQuantity: 1, unitCostAmount: 100 },
            ],
          } as never,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.tx.purchaseOrder.create).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('refuses to let the creator approve their own purchase order', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseOrderStatus.SUBMITTED,
        createdByUserId: 'user-1',
        lines: [],
      });

      await expect(
        service.approve('po-1', 0, 'user-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.tx.purchaseOrder.updateMany).not.toHaveBeenCalled();
    });

    it('rejects approving a purchase order that is not SUBMITTED', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseOrderStatus.DRAFT,
        createdByUserId: 'user-2',
        lines: [],
      });

      await expect(
        service.approve('po-1', 0, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('approves when the actor differs from the creator', async () => {
      prisma.purchaseOrder.findUnique
        .mockResolvedValueOnce({
          id: 'po-1',
          status: PurchaseOrderStatus.SUBMITTED,
          createdByUserId: 'user-2',
          lines: [],
        })
        .mockResolvedValueOnce({
          id: 'po-1',
          status: PurchaseOrderStatus.SUBMITTED,
          createdByUserId: 'user-2',
          lines: [],
        });
      prisma.tx.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.tx.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
        id: 'po-1',
        poNumber: 'PO-2026-000001',
        status: PurchaseOrderStatus.APPROVED,
        createdByUserId: 'user-2',
        lines: [],
      });

      const result = await service.approve('po-1', 0, 'user-1');

      expect(result.status).toBe(PurchaseOrderStatus.APPROVED);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'procurement.purchase_order.approved' }),
        prisma.tx,
      );
    });
  });

  describe('cancel', () => {
    it('refuses to cancel a purchase order that already has a posted receipt', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseOrderStatus.ORDERED,
        goodsReceipts: [{ status: 'POSTED' }],
      });

      await expect(
        service.cancel('po-1', 0, 'no longer needed', 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
