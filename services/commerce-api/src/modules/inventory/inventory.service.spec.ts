import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { BackgroundJobsService } from '../../infrastructure/jobs/background-jobs.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from './inventory.service';

function buildPrisma(): {
  inventoryRecord: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    upsert: jest.Mock;
  };
  inventoryMovement: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  reservation: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    groupBy: jest.Mock;
  };
  stockAdjustmentReceipt: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  $queryRaw: jest.Mock;
  $executeRaw: jest.Mock;
  $transaction: jest.Mock;
} {
  const prisma = {
    inventoryRecord: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    inventoryMovement: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    reservation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    stockAdjustmentReceipt: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => unknown) => callback(prisma),
  );
  return prisma;
}

/**
 * The row locks taken through tagged-template `$queryRaw`, in call order, as
 * `<table>:<id>` (one entry per id for an `= ANY(...)` lock).
 */
function rowLocks(mock: jest.Mock): string[] {
  return (mock.mock.calls as [TemplateStringsArray, ...unknown[]][]).flatMap(
    ([strings, ...values]) => {
      const sql = strings.join('?');
      const table = /FROM (\w+)/.exec(sql)?.[1] ?? '?';
      return values.flatMap((value) =>
        (Array.isArray(value) ? (value as string[]) : [value as string]).map(
          (id) => `${table}:${id}`,
        ),
      );
    },
  );
}

function ascending(values: number[]): boolean {
  return values.every(
    (value, index) => (values[index - 1] ?? Number.NEGATIVE_INFINITY) < value,
  );
}

describe('InventoryService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let backgroundJobsService: { enqueue: jest.Mock };
  let auditService: { record: jest.Mock };
  let service: InventoryService;

  beforeEach(() => {
    prisma = buildPrisma();
    backgroundJobsService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new InventoryService(
      prisma as unknown as PrismaService,
      backgroundJobsService as unknown as BackgroundJobsService,
      auditService as unknown as AuditService,
    );
  });

  describe('getAvailableQuantity', () => {
    it('sums onHand minus reserved across every warehouse record for the variant', async () => {
      prisma.inventoryRecord.findMany.mockResolvedValue([
        { onHand: 10, reserved: 4 },
        { onHand: 5, reserved: 0 },
      ]);

      await expect(service.getAvailableQuantity('v1')).resolves.toBe(11);
    });

    it('returns 0 when no inventory record exists for the variant', async () => {
      prisma.inventoryRecord.findMany.mockResolvedValue([]);

      await expect(service.getAvailableQuantity('v1')).resolves.toBe(0);
    });
  });

  it('batches availability across variants and warehouses with one query', async () => {
    prisma.inventoryRecord.findMany.mockResolvedValue([
      { variantId: 'v1', onHand: 5, reserved: 1 },
      { variantId: 'v1', onHand: 8, reserved: 2 },
      { variantId: 'v2', onHand: 3, reserved: 1 },
    ]);
    await expect(
      service.getAvailableQuantities(['v1', 'v1', 'v2']),
    ).resolves.toEqual(
      new Map([
        ['v1', 10],
        ['v2', 2],
      ]),
    );
    expect(prisma.inventoryRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryRecord.findMany).toHaveBeenCalledWith({
      where: { variantId: { in: ['v1', 'v2'] }, offerId: null },
      select: { variantId: true, onHand: true, reserved: true },
    });
  });

  it('batches seller availability by offer without mixing platform stock', async () => {
    prisma.inventoryRecord.findMany.mockResolvedValue([
      { offerId: 'offer-1', onHand: 8, reserved: 3 },
      { offerId: 'offer-2', onHand: 2, reserved: 0 },
    ]);

    await expect(
      service.getAvailableOfferQuantities(['offer-1', 'offer-1', 'offer-2']),
    ).resolves.toEqual(
      new Map([
        ['offer-1', 5],
        ['offer-2', 2],
      ]),
    );
    expect(prisma.inventoryRecord.findMany).toHaveBeenCalledWith({
      where: { offerId: { in: ['offer-1', 'offer-2'] } },
      select: { offerId: true, onHand: true, reserved: true },
    });
  });

  describe('setOfferQuantity', () => {
    it('uses optimistic concurrency and records the signed quantity change', async () => {
      prisma.inventoryRecord.findUnique.mockResolvedValue({
        id: 'record-1',
        offerId: 'offer-1',
        variantId: 'variant-1',
        onHand: 3,
        reserved: 1,
        version: 2,
      });
      prisma.inventoryRecord.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryRecord.findUniqueOrThrow.mockResolvedValue({
        id: 'record-1',
        offerId: 'offer-1',
        variantId: 'variant-1',
        onHand: 7,
        reserved: 1,
        version: 3,
      });

      await service.setOfferQuantity(
        'offer-1',
        'variant-1',
        7,
        2,
        'user-1',
        'counted',
      );

      expect(prisma.inventoryRecord.updateMany).toHaveBeenCalledWith({
        where: { id: 'record-1', version: 2, reserved: { lte: 7 } },
        data: { onHand: 7, version: { increment: 1 } },
      });
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'ADJUSTMENT',
          quantity: 4,
          referenceType: 'seller_user',
          referenceId: 'user-1',
        }) as object,
      });
    });

    it('rejects a stale version or a quantity below reserved stock', async () => {
      prisma.inventoryRecord.findUnique.mockResolvedValue({
        id: 'record-1',
        onHand: 5,
        reserved: 4,
        version: 2,
      });
      prisma.inventoryRecord.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.setOfferQuantity('offer-1', 'variant-1', 3, 1, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('does not expire an active reservation before its deadline', async () => {
    prisma.reservation.findUnique.mockResolvedValue({
      id: 'res',
      status: ReservationStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 60000),
    });
    await service.expireReservation('res');
    expect(prisma.reservation.update).not.toHaveBeenCalled();
  });

  it('does not restock a committed reservation with an existing return movement', async () => {
    prisma.reservation.findUnique.mockResolvedValue({
      id: 'res',
      status: ReservationStatus.COMMITTED,
      quantity: 2,
    });
    prisma.inventoryMovement.findFirst.mockResolvedValue({ id: 'return' });
    await service.restock('res');
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  describe('receiveStock', () => {
    it('rejects a non-positive quantity', async () => {
      await expect(service.receiveStock('w1', 'v1', 0)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('increments onHand and records a RECEIPT movement', async () => {
      prisma.inventoryRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        warehouseId: 'w1',
        variantId: 'v1',
        onHand: 5,
        reserved: 0,
      });
      prisma.inventoryRecord.update.mockResolvedValue({
        id: 'rec-1',
        onHand: 15,
        reserved: 0,
      });

      const result = await service.receiveStock(
        'w1',
        'v1',
        10,
        'initial stock',
      );

      expect(prisma.inventoryRecord.update).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
        data: { onHand: { increment: 10 } },
      });
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'RECEIPT',
            quantity: 10,
          }) as object,
        }),
      );
      expect(result.available).toBe(15);
    });
  });

  describe('adjustStock', () => {
    it('rejects a zero delta', async () => {
      await expect(service.adjustStock('w1', 'v1', 0)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an adjustment that would drive on-hand negative', async () => {
      prisma.inventoryRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        warehouseId: 'w1',
        variantId: 'v1',
        onHand: 2,
        reserved: 0,
      });
      prisma.$executeRaw.mockResolvedValue(0);

      prisma.inventoryRecord.upsert.mockResolvedValue({ id: 'rec-1' });
      prisma.inventoryRecord.findUniqueOrThrow.mockResolvedValue({
        id: 'rec-1',
        warehouseId: 'w1',
        offerId: null,
        variantId: 'v1',
        onHand: 2,
        reserved: 0,
        reorderPoint: 0,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.adjustStock('w1', 'v1', -5, undefined, {
          actorUserId: 'actor-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.inventoryRecord.update).not.toHaveBeenCalled();
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });

    it('stores the signed movement and an actor audit in the transaction', async () => {
      const createdAt = new Date('2026-09-30T12:00:00.000Z');
      const before = {
        id: 'rec-1',
        warehouseId: 'w1',
        offerId: null,
        variantId: 'v1',
        onHand: 10,
        reserved: 8,
        reorderPoint: 0,
        version: 0,
        createdAt,
        updatedAt: createdAt,
      };
      const after = { ...before, onHand: 9, updatedAt: new Date() };
      prisma.inventoryRecord.upsert.mockResolvedValue(before);
      prisma.inventoryRecord.findUniqueOrThrow.mockResolvedValue(before);
      prisma.inventoryRecord.update.mockResolvedValue(after);
      prisma.inventoryMovement.create.mockResolvedValue({ id: 'movement-1' });

      await expect(
        service.adjustStock('w1', 'v1', -1, 'cycle count', {
          actorUserId: 'actor-1',
          ipAddress: '127.0.0.1',
        }),
      ).resolves.toEqual({ ...after, available: 1 });

      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inventoryRecordId: 'rec-1',
          type: 'ADJUSTMENT',
          quantity: -1,
          note: 'cycle count',
        }) as object,
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'actor-1',
          action: 'inventory.stock.adjusted',
          targetId: 'rec-1',
          metadata: expect.objectContaining({
            movementId: 'movement-1',
            before: { onHand: 10, reserved: 8, available: 2 },
            after: { onHand: 9, reserved: 8, available: 1 },
          }) as object,
        }),
        prisma,
      );
    });
  });

  describe('reserve', () => {
    it('rejects a non-positive quantity', async () => {
      await expect(service.reserve('v1', 0)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws not found when no inventory record exists for the variant', async () => {
      prisma.inventoryRecord.findMany.mockResolvedValue([]);

      await expect(
        service.reserve('missing-variant', 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when available stock is insufficient', async () => {
      const record = {
        id: 'rec-1',
        warehouseId: 'w1',
        variantId: 'v1',
        onHand: 5,
        reserved: 5,
      };
      prisma.inventoryRecord.findMany.mockResolvedValue([record]);
      prisma.reservation.findUnique.mockImplementation(() =>
        Promise.resolve({
          id: 'res-old',
          status: ReservationStatus.ACTIVE,
          quantity: 4,
          inventoryRecordId: 'rec-1',
          expiresAt: new Date(0),
        }),
      );
      prisma.reservation.findMany.mockResolvedValue([]);

      await expect(service.reserve('v1', 1)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('sweeps expired reservations before evaluating availability', async () => {
      prisma.reservation.findUnique.mockResolvedValue({
        id: 'res-old',
        status: ReservationStatus.ACTIVE,
        quantity: 4,
        inventoryRecordId: 'rec-1',
        expiresAt: new Date(0),
      });
      const record = {
        id: 'rec-1',
        warehouseId: 'w1',
        variantId: 'v1',
        onHand: 10,
        reserved: 10,
      };
      const expiredReservation = {
        id: 'res-old',
        inventoryRecordId: 'rec-1',
        quantity: 10,
        status: ReservationStatus.ACTIVE,
      };

      prisma.inventoryRecord.findMany
        .mockResolvedValueOnce([record]) // initial candidates lookup
        .mockResolvedValueOnce([{ ...record, reserved: 0 }]); // refreshed after sweep
      prisma.reservation.findMany.mockResolvedValue([expiredReservation]);
      prisma.reservation.update.mockResolvedValue({
        ...expiredReservation,
        status: ReservationStatus.EXPIRED,
      });
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.reservation.create.mockResolvedValue({
        id: 'res-new',
        inventoryRecordId: 'rec-1',
        quantity: 4,
        status: ReservationStatus.ACTIVE,
      });

      const reservation = await service.reserve('v1', 4);

      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: 'res-old' },
        data: { status: ReservationStatus.EXPIRED },
      });
      expect(reservation.id).toBe('res-new');
      expect(backgroundJobsService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'inventory.expire_reservation',
        }) as object,
        expect.anything() as object,
      );
    });

    it('creates a reservation and enqueues an expiry job when stock is available', async () => {
      const record = {
        id: 'rec-1',
        warehouseId: 'w1',
        variantId: 'v1',
        onHand: 10,
        reserved: 0,
      };
      prisma.inventoryRecord.findMany.mockResolvedValue([record]);
      prisma.reservation.findMany.mockResolvedValue([]);
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.reservation.create.mockResolvedValue({
        id: 'res-1',
        inventoryRecordId: 'rec-1',
        quantity: 3,
        status: ReservationStatus.ACTIVE,
      });

      const reservation = await service.reserve('v1', 3, {
        holderType: 'cart',
        holderId: 'cart-1',
      });

      expect(prisma.reservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inventoryRecordId: 'rec-1',
          quantity: 3,
          holderType: 'cart',
          holderId: 'cart-1',
        }) as object,
      });
      expect(reservation.id).toBe('res-1');
      expect(backgroundJobsService.enqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('release', () => {
    it('throws not found for an unknown reservation', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);

      await expect(service.release('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('is idempotent for an already-released reservation', async () => {
      const reservation = {
        id: 'res-1',
        status: ReservationStatus.RELEASED,
        quantity: 2,
        inventoryRecordId: 'rec-1',
      };
      prisma.reservation.findUnique.mockResolvedValue(reservation);

      const result = await service.release('res-1');

      expect(result).toBe(reservation);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('decrements reserved stock and marks the reservation RELEASED', async () => {
      const reservation = {
        id: 'res-1',
        status: ReservationStatus.ACTIVE,
        quantity: 2,
        inventoryRecordId: 'rec-1',
      };
      prisma.reservation.findUnique.mockResolvedValue(reservation);
      prisma.reservation.update.mockResolvedValue({
        ...reservation,
        status: ReservationStatus.RELEASED,
      });

      await service.release('res-1');

      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: 'res-1' },
        data: { status: ReservationStatus.RELEASED },
      });
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'RELEASE' }) as object,
        }),
      );
    });
  });

  describe('expireReservation', () => {
    it('throws not found for an unknown reservation', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);

      await expect(service.expireReservation('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('is a no-op for a reservation that is no longer ACTIVE', async () => {
      const reservation = {
        id: 'res-1',
        status: ReservationStatus.COMMITTED,
        quantity: 2,
        inventoryRecordId: 'rec-1',
      };
      prisma.reservation.findUnique.mockResolvedValue(reservation);

      await service.expireReservation('res-1');

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.reservation.update).not.toHaveBeenCalled();
    });

    it('decrements reserved stock and marks the reservation EXPIRED', async () => {
      const reservation = {
        id: 'res-1',
        status: ReservationStatus.ACTIVE,
        quantity: 2,
        inventoryRecordId: 'rec-1',
      };
      prisma.reservation.findUnique.mockResolvedValue(reservation);
      prisma.reservation.update.mockResolvedValue({
        ...reservation,
        status: ReservationStatus.EXPIRED,
      });

      await service.expireReservation('res-1');

      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: 'res-1' },
        data: { status: ReservationStatus.EXPIRED },
      });
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'RELEASE' }) as object,
        }),
      );
    });
  });

  describe('commit', () => {
    it('rejects committing a non-active, non-committed reservation', async () => {
      prisma.reservation.findUnique.mockResolvedValue({
        id: 'res-1',
        status: ReservationStatus.RELEASED,
        quantity: 2,
        inventoryRecordId: 'rec-1',
      });

      await expect(service.commit('res-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('is idempotent for an already-committed reservation', async () => {
      const reservation = {
        id: 'res-1',
        status: ReservationStatus.COMMITTED,
        quantity: 2,
        inventoryRecordId: 'rec-1',
      };
      prisma.reservation.findUnique.mockResolvedValue(reservation);

      const result = await service.commit('res-1');

      expect(result).toBe(reservation);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('decrements both onHand and reserved, and marks the reservation COMMITTED', async () => {
      const reservation = {
        id: 'res-1',
        status: ReservationStatus.ACTIVE,
        quantity: 2,
        inventoryRecordId: 'rec-1',
      };
      prisma.reservation.findUnique.mockResolvedValue(reservation);
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.reservation.update.mockResolvedValue({
        ...reservation,
        status: ReservationStatus.COMMITTED,
      });

      await service.commit('res-1');

      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: 'res-1' },
        data: { status: ReservationStatus.COMMITTED },
      });
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'COMMITMENT' }) as object,
        }),
      );
    });
  });

  describe('restock', () => {
    it('is a no-op for a reservation that is not COMMITTED', async () => {
      prisma.reservation.findUnique.mockResolvedValue({
        id: 'res-1',
        status: ReservationStatus.RELEASED,
        quantity: 2,
        inventoryRecordId: 'rec-1',
      });

      await service.restock('res-1');

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('adds the reservation quantity back onto onHand and records a RETURN movement', async () => {
      prisma.reservation.findUnique.mockResolvedValue({
        id: 'res-1',
        status: ReservationStatus.COMMITTED,
        quantity: 2,
        inventoryRecordId: 'rec-1',
      });
      prisma.$executeRaw.mockResolvedValue(1);

      await service.restock('res-1');

      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'RETURN',
            quantity: 2,
          }) as object,
        }),
      );
      expect(prisma.reservation.update).not.toHaveBeenCalled();
    });
  });

  describe('returnCancelledStock', () => {
    it('rejects a non-positive quantity', async () => {
      await expect(
        service.returnCancelledStock(prisma as never, 'wh-1', 'v1', 0, {
          referenceType: 'fulfillment_cancellation',
          referenceId: 'fe-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('increments on-hand and records a RETURN movement', async () => {
      prisma.inventoryRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        onHand: 2,
        reserved: 0,
      });
      prisma.inventoryRecord.update.mockResolvedValue({
        id: 'rec-1',
        onHand: 5,
        reserved: 0,
      });
      prisma.inventoryMovement.create.mockResolvedValue({
        id: 'mv-1',
        type: 'RETURN',
      });

      const { record } = await service.returnCancelledStock(
        prisma as never,
        'wh-1',
        'v1',
        3,
        { referenceType: 'fulfillment_cancellation', referenceId: 'fe-1' },
      );

      expect(record.onHand).toBe(5);
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'RETURN',
            quantity: 3,
            referenceType: 'fulfillment_cancellation',
            referenceId: 'fe-1',
          }) as object,
        }),
      );
    });
  });

  describe('receiveStockForReference', () => {
    it('rejects a non-positive quantity', async () => {
      await expect(
        service.receiveStockForReference(prisma as never, 'wh-1', 'v1', 0, {
          referenceType: 'goods_receipt_line',
          referenceId: 'grl-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('increments on-hand and tags the movement with the caller reference', async () => {
      prisma.inventoryRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        onHand: 5,
        reserved: 0,
      });
      prisma.inventoryRecord.update.mockResolvedValue({
        id: 'rec-1',
        onHand: 8,
        reserved: 0,
      });
      prisma.inventoryMovement.create.mockResolvedValue({
        id: 'mv-1',
        type: 'RECEIPT',
      });

      const { record, movement } = await service.receiveStockForReference(
        prisma as never,
        'wh-1',
        'v1',
        3,
        { referenceType: 'goods_receipt_line', referenceId: 'grl-1' },
      );

      expect(record.onHand).toBe(8);
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'RECEIPT',
            quantity: 3,
            referenceType: 'goods_receipt_line',
            referenceId: 'grl-1',
          }) as object,
        }),
      );
      expect(movement).toBeDefined();
    });
  });

  describe('reverseReceiptStock', () => {
    it('rejects a non-positive quantity', async () => {
      await expect(
        service.reverseReceiptStock(prisma as never, 'wh-1', 'v1', 0, {
          referenceType: 'goods_receipt_reversal_line',
          referenceId: 'grl-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to push on-hand below zero', async () => {
      prisma.inventoryRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        onHand: 2,
        reserved: 0,
      });
      prisma.$executeRaw.mockResolvedValue(0);

      await expect(
        service.reverseReceiptStock(prisma as never, 'wh-1', 'v1', 5, {
          referenceType: 'goods_receipt_reversal_line',
          referenceId: 'grl-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('decrements on-hand and records an ADJUSTMENT movement', async () => {
      prisma.inventoryRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        onHand: 10,
        reserved: 0,
      });
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.inventoryRecord.findUniqueOrThrow.mockResolvedValue({
        id: 'rec-1',
        onHand: 7,
        reserved: 0,
      });

      const { record } = await service.reverseReceiptStock(
        prisma as never,
        'wh-1',
        'v1',
        3,
        { referenceType: 'goods_receipt_reversal_line', referenceId: 'grl-1' },
      );

      expect(record.onHand).toBe(7);
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'ADJUSTMENT',
            quantity: -3,
            referenceType: 'goods_receipt_reversal_line',
            referenceId: 'grl-1',
          }) as object,
        }),
      );
    });
  });

  describe('lock ordering', () => {
    const ID_A = '0a000000-0000-4000-8000-000000000000';
    const ID_B = '1b000000-0000-4000-8000-000000000000';
    const ID_C = 'fc000000-0000-4000-8000-000000000000';

    it('lockInventoryRecords locks each record once, in ascending id', async () => {
      await service.lockInventoryRecords(
        [ID_C, ID_A, ID_C, ID_B, ID_A],
        prisma as never,
      );

      expect(rowLocks(prisma.$queryRaw)).toEqual([
        `inventory_records:${ID_A}`,
        `inventory_records:${ID_B}`,
        `inventory_records:${ID_C}`,
      ]);
      for (const [strings] of prisma.$queryRaw.mock.calls as [
        TemplateStringsArray,
      ][])
        expect(strings.join('?')).toMatch(/FOR UPDATE/);
    });

    it('lockInventoryRecords sorts by code unit, not locale collation', async () => {
      // Uppercase sorts before lowercase in code-unit order; localeCompare
      // would interleave them and disagree with PostgreSQL's uuid order.
      await service.lockInventoryRecords(['b', 'B', 'a', 'A'], prisma as never);

      expect(rowLocks(prisma.$queryRaw)).toEqual([
        'inventory_records:A',
        'inventory_records:B',
        'inventory_records:a',
        'inventory_records:b',
      ]);
    });

    it('lockInventoryRecords takes no lock for an empty set', async () => {
      await service.lockInventoryRecords([], prisma as never);

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('lockOffersForKeyShare takes one KEY SHARE lock over the sorted, unique offers', async () => {
      await service.lockOffersForKeyShare([ID_C, ID_A, ID_C], prisma as never);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const [strings, ids] = prisma.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        string[],
      ];
      expect(strings.join('?')).toMatch(
        /FROM offers WHERE id = ANY\(\?::uuid\[\]\) ORDER BY id FOR KEY SHARE/,
      );
      expect(ids).toEqual([ID_A, ID_C]);
    });

    it('lockOffersForKeyShare takes no lock for no offers', async () => {
      await service.lockOffersForKeyShare([], prisma as never);

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('lockStockPools locks every record a line could draw from, once, ascending, and returns them', async () => {
      prisma.inventoryRecord.findMany.mockResolvedValue([
        { id: ID_C },
        { id: ID_A },
        { id: ID_C },
        { id: ID_B },
      ]);

      const locked = await service.lockStockPools(
        [
          { id: 'offer-s', variantId: 'variant-s', stockSource: 'SELLER' },
          { id: 'offer-p', variantId: 'variant-p', stockSource: 'PLATFORM' },
        ],
        prisma as never,
      );

      expect(prisma.inventoryRecord.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { offerId: 'offer-s' },
            { variantId: 'variant-p', offerId: null },
          ],
        },
        select: { id: true },
      });
      expect(locked).toEqual([ID_A, ID_B, ID_C]);
      expect(rowLocks(prisma.$queryRaw)).toEqual(
        locked.map((id) => `inventory_records:${id}`),
      );
    });

    it('lockStockPools reads and locks nothing for no offers', async () => {
      await expect(
        service.lockStockPools([], prisma as never),
      ).resolves.toEqual([]);

      expect(prisma.inventoryRecord.findMany).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('lockRecordsForWrite locks the existing records ascending and returns their keys in that order', async () => {
      prisma.inventoryRecord.findMany.mockResolvedValue([
        { id: ID_C, offerId: null, warehouseId: 'w1', variantId: 'v1' },
        { id: ID_A, offerId: 'offer-1', warehouseId: null, variantId: 'v2' },
      ]);

      const locked = await service.lockRecordsForWrite(
        [
          { warehouseId: 'w1', variantId: 'v1' },
          { offerId: 'offer-1' },
          { warehouseId: 'w9', variantId: 'v-new' },
        ],
        prisma as never,
      );

      expect(prisma.inventoryRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { warehouseId: 'w1', variantId: 'v1', offerId: null },
              { offerId: 'offer-1' },
              { warehouseId: 'w9', variantId: 'v-new', offerId: null },
            ],
          },
        }),
      );
      expect(locked.map((record) => record.id)).toEqual([ID_A, ID_C]);
      expect(rowLocks(prisma.$queryRaw)).toEqual([
        `inventory_records:${ID_A}`,
        `inventory_records:${ID_C}`,
      ]);
    });
  });

  describe('releaseMany / commitMany', () => {
    const RES_A = '0a000000-0000-4000-8000-0000000000a0';
    const RES_B = '1b000000-0000-4000-8000-0000000000b0';
    const RES_C = 'fc000000-0000-4000-8000-0000000000c0';
    const REC_LOW = '00000000-0000-4000-8000-000000000001';
    const REC_HIGH = 'ff000000-0000-4000-8000-000000000002';

    /** Reservations as their unlocked first read and their locked re-read see them. */
    function reservations(
      statuses: Record<string, ReservationStatus>,
    ): Record<string, unknown>[] {
      const recordOf: Record<string, string> = {
        [RES_A]: REC_HIGH,
        [RES_B]: REC_LOW,
        [RES_C]: REC_HIGH,
      };
      return Object.entries(statuses).map(([id, status]) => ({
        id,
        status,
        quantity: 1,
        inventoryRecordId: recordOf[id],
      }));
    }

    beforeEach(() => {
      prisma.reservation.update.mockImplementation(
        ({ where, data }: { where: { id: string }; data: object }) =>
          Promise.resolve({ id: where.id, ...data }),
      );
    });

    it('releaseMany locks all records ascending, then all reservations ascending, then releases in reservation order', async () => {
      // Returned out of order, as a database may.
      const rows = reservations({
        [RES_C]: ReservationStatus.ACTIVE,
        [RES_A]: ReservationStatus.ACTIVE,
        [RES_B]: ReservationStatus.ACTIVE,
      });
      prisma.reservation.findMany.mockResolvedValue(rows);

      await service.releaseMany([RES_C, RES_A, RES_B, RES_A], prisma as never);

      expect(prisma.reservation.findMany).toHaveBeenNthCalledWith(1, {
        where: { id: { in: [RES_A, RES_B, RES_C] } },
        select: { id: true, inventoryRecordId: true },
      });
      expect(rowLocks(prisma.$queryRaw)).toEqual([
        `inventory_records:${REC_LOW}`,
        `inventory_records:${REC_HIGH}`,
        `reservations:${RES_A}`,
        `reservations:${RES_B}`,
        `reservations:${RES_C}`,
      ]);
      const lastLock = Math.max(...prisma.$queryRaw.mock.invocationCallOrder);
      expect(
        prisma.$executeRaw.mock.invocationCallOrder.every(
          (order) => order > lastLock,
        ),
      ).toBe(true);
      expect(
        prisma.reservation.update.mock.calls.map(
          ([args]) => (args as { where: { id: string } }).where.id,
        ),
      ).toEqual([RES_A, RES_B, RES_C]);
      expect(
        ascending(prisma.reservation.update.mock.invocationCallOrder),
      ).toBe(true);
    });

    it('releaseMany skips reservations already released or expired', async () => {
      prisma.reservation.findMany.mockResolvedValue(
        reservations({
          [RES_A]: ReservationStatus.RELEASED,
          [RES_B]: ReservationStatus.ACTIVE,
          [RES_C]: ReservationStatus.EXPIRED,
        }),
      );

      const result = await service.releaseMany(
        [RES_A, RES_B, RES_C],
        prisma as never,
      );

      expect(prisma.reservation.update).toHaveBeenCalledTimes(1);
      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: RES_B },
        data: { status: ReservationStatus.RELEASED },
      });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(result.map((reservation) => reservation.status)).toEqual([
        ReservationStatus.RELEASED,
        ReservationStatus.RELEASED,
        ReservationStatus.EXPIRED,
      ]);
    });

    it('releaseMany refuses, locking nothing, when a reservation does not exist', async () => {
      prisma.reservation.findMany.mockResolvedValue(
        reservations({ [RES_A]: ReservationStatus.ACTIVE }),
      );

      await expect(
        service.releaseMany([RES_A, RES_B], prisma as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.reservation.update).not.toHaveBeenCalled();
    });

    it('releaseMany of nothing reads and locks nothing', async () => {
      await expect(service.releaseMany([], prisma as never)).resolves.toEqual(
        [],
      );
      expect(prisma.reservation.findMany).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('releaseMany opens exactly one transaction when called standalone', async () => {
      prisma.reservation.findMany.mockResolvedValue(
        reservations({ [RES_A]: ReservationStatus.ACTIVE }),
      );

      await service.releaseMany([RES_A]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('commitMany uses the same lock order and commits in reservation order', async () => {
      prisma.reservation.findMany.mockResolvedValue(
        reservations({
          [RES_C]: ReservationStatus.ACTIVE,
          [RES_B]: ReservationStatus.COMMITTED,
          [RES_A]: ReservationStatus.ACTIVE,
        }),
      );

      await service.commitMany([RES_C, RES_B, RES_A], prisma as never);

      expect(rowLocks(prisma.$queryRaw)).toEqual([
        `inventory_records:${REC_LOW}`,
        `inventory_records:${REC_HIGH}`,
        `reservations:${RES_A}`,
        `reservations:${RES_B}`,
        `reservations:${RES_C}`,
      ]);
      // RES_B is already committed: skipped, not committed twice.
      expect(
        prisma.reservation.update.mock.calls.map(
          ([args]) => (args as { where: { id: string } }).where.id,
        ),
      ).toEqual([RES_A, RES_C]);
      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: RES_A },
        data: { status: ReservationStatus.COMMITTED },
      });
    });

    it('commitMany refuses a reservation that was released meanwhile', async () => {
      prisma.reservation.findMany.mockResolvedValue(
        reservations({
          [RES_A]: ReservationStatus.ACTIVE,
          [RES_B]: ReservationStatus.RELEASED,
        }),
      );

      await expect(
        service.commitMany([RES_A, RES_B], prisma as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('reserve within a pre-locked transaction', () => {
    const REC_1 = '10000000-0000-4000-8000-000000000000';
    const REC_2 = '20000000-0000-4000-8000-000000000000';
    const REC_LATE = '05000000-0000-4000-8000-000000000000';

    beforeEach(() => {
      prisma.reservation.findMany.mockResolvedValue([]);
      prisma.reservation.create.mockResolvedValue({ id: 'res-new' });
    });

    it('only considers the records the pool lock took, locked ascending', async () => {
      prisma.inventoryRecord.findMany
        .mockResolvedValueOnce([{ id: REC_2 }, { id: REC_1 }])
        .mockResolvedValueOnce([
          { id: REC_1, onHand: 5, reserved: 0 },
          { id: REC_2, onHand: 9, reserved: 0 },
        ]);

      await service.reserve(
        'v1',
        2,
        { lockedRecordIds: [REC_1, REC_2] },
        prisma as never,
      );

      expect(prisma.inventoryRecord.findMany).toHaveBeenNthCalledWith(1, {
        where: { variantId: 'v1', offerId: null, id: { in: [REC_1, REC_2] } },
        select: { id: true },
      });
      // A record created after the pool lock (REC_LATE) is never even read,
      // so it can never be locked behind higher ids already held.
      expect(rowLocks(prisma.$queryRaw)).not.toContain(
        `inventory_records:${REC_LATE}`,
      );
      expect(rowLocks(prisma.$queryRaw).slice(0, 2)).toEqual([
        `inventory_records:${REC_1}`,
        `inventory_records:${REC_2}`,
      ]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('serves a line whole from the first record in ascending id that can hold it', async () => {
      prisma.inventoryRecord.findMany
        .mockResolvedValueOnce([{ id: REC_1 }, { id: REC_2 }])
        .mockResolvedValueOnce([
          { id: REC_1, onHand: 2, reserved: 0 },
          { id: REC_2, onHand: 5, reserved: 0 },
        ]);

      await service.reserve('v1', 3, {}, prisma as never);

      expect(prisma.inventoryRecord.findMany).toHaveBeenNthCalledWith(2, {
        where: { id: { in: [REC_1, REC_2] } },
        orderBy: { id: 'asc' },
      });
      expect(prisma.reservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inventoryRecordId: REC_2,
          quantity: 3,
        }) as object,
      });
    });

    it('never splits a line across records', async () => {
      prisma.inventoryRecord.findMany
        .mockResolvedValueOnce([{ id: REC_1 }, { id: REC_2 }])
        .mockResolvedValueOnce([
          { id: REC_1, onHand: 4, reserved: 0 },
          { id: REC_2, onHand: 4, reserved: 0 },
        ]);

      await expect(
        service.reserve('v1', 6, {}, prisma as never),
      ).rejects.toThrow('Insufficient available stock');
      expect(prisma.reservation.create).not.toHaveBeenCalled();
    });

    it('runs every step on the caller transaction, never the root client', async () => {
      const tx = buildPrisma();
      tx.inventoryRecord.findMany
        .mockResolvedValueOnce([{ id: REC_1 }])
        .mockResolvedValueOnce([{ id: REC_1, onHand: 5, reserved: 0 }]);
      tx.reservation.findMany.mockResolvedValue([]);
      tx.reservation.create.mockResolvedValue({ id: 'res-new' });

      await service.reserve('v1', 1, {}, tx as never);

      expect(backgroundJobsService.enqueue).toHaveBeenCalledWith(
        expect.anything(),
        tx,
      );
      for (const delegate of [
        prisma.inventoryRecord,
        prisma.reservation,
        prisma.inventoryMovement,
      ])
        for (const method of Object.values(delegate))
          expect(method).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('reserveOffer treats a record outside the locked set as missing, without locking it', async () => {
      prisma.inventoryRecord.findUnique.mockResolvedValue({
        id: REC_LATE,
        offerId: 'offer-1',
      });

      await expect(
        service.reserveOffer(
          'offer-1',
          1,
          { lockedRecordIds: [REC_1] },
          prisma as never,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('reserveOffer reserves from a record inside the locked set', async () => {
      prisma.inventoryRecord.findUnique.mockResolvedValue({
        id: REC_1,
        offerId: 'offer-1',
      });
      prisma.inventoryRecord.findUniqueOrThrow.mockResolvedValue({
        id: REC_1,
        onHand: 3,
        reserved: 1,
      });

      await service.reserveOffer(
        'offer-1',
        2,
        { lockedRecordIds: [REC_1] },
        prisma as never,
      );

      expect(rowLocks(prisma.$queryRaw)[0]).toBe(`inventory_records:${REC_1}`);
      expect(prisma.reservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inventoryRecordId: REC_1,
          quantity: 2,
        }) as object,
      });
    });
  });

  describe('sweepExpired', () => {
    it('locks the record before reading and expiring its lapsed reservations in id order', async () => {
      prisma.reservation.findMany.mockResolvedValue([
        { id: 'res-1', inventoryRecordId: 'rec-1' },
      ]);
      prisma.reservation.findUnique.mockResolvedValue({
        id: 'res-1',
        status: ReservationStatus.ACTIVE,
        quantity: 1,
        inventoryRecordId: 'rec-1',
        expiresAt: new Date(0),
      });

      await service.sweepExpired('rec-1', prisma as never);

      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.reservation.findMany.mock.invocationCallOrder[0] ?? 0,
      );
      expect(prisma.reservation.findMany).toHaveBeenCalledWith({
        where: {
          inventoryRecordId: 'rec-1',
          status: ReservationStatus.ACTIVE,
          expiresAt: { lt: expect.any(Date) as unknown },
        },
        orderBy: { id: 'asc' },
      });
      // Record before reservation, on every step.
      expect(rowLocks(prisma.$queryRaw)).toEqual([
        'inventory_records:rec-1',
        'inventory_records:rec-1',
        'reservations:res-1',
      ]);
      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: 'res-1' },
        data: { status: ReservationStatus.EXPIRED },
      });
    });
  });

  describe('getAllocatableStock', () => {
    it('reports each record of each pool in ascending id, counting lapsed reservations as free', async () => {
      prisma.inventoryRecord.findMany.mockResolvedValue([
        { id: 'r1', variantId: 'v1', offerId: null, onHand: 5, reserved: 3 },
        { id: 'r2', variantId: 'v1', offerId: null, onHand: 4, reserved: 0 },
        { id: 'r3', variantId: 'vx', offerId: 'o1', onHand: 2, reserved: 2 },
      ]);
      prisma.reservation.groupBy.mockResolvedValue([
        { inventoryRecordId: 'r1', _sum: { quantity: 2 } },
        { inventoryRecordId: 'r3', _sum: { quantity: null } },
      ]);

      const stock = await service.getAllocatableStock([
        { kind: 'variant', variantId: 'v1' },
        { kind: 'offer', offerId: 'o1' },
        { kind: 'variant', variantId: 'v-none' },
      ]);

      expect(stock).toEqual(
        new Map([
          ['variant:v1', [4, 4]],
          ['offer:o1', [0]],
          ['variant:v-none', []],
        ]),
      );
      expect(prisma.inventoryRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { variantId: 'v1', offerId: null },
              { offerId: 'o1' },
              { variantId: 'v-none', offerId: null },
            ],
          },
          orderBy: { id: 'asc' },
        }),
      );
      expect(prisma.reservation.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            inventoryRecordId: { in: ['r1', 'r2', 'r3'] },
            status: ReservationStatus.ACTIVE,
            expiresAt: { lt: expect.any(Date) as unknown },
          },
        }),
      );
      // Read-only: never a lock.
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('reads nothing for no pools', async () => {
      await expect(service.getAllocatableStock([])).resolves.toEqual(new Map());
      expect(prisma.inventoryRecord.findMany).not.toHaveBeenCalled();
    });

    it('reads through the client it is given', async () => {
      const client = buildPrisma();
      client.inventoryRecord.findMany.mockResolvedValue([]);

      await service.getAllocatableStock(
        [{ kind: 'offer', offerId: 'o1' }],
        client as never,
      );

      expect(client.inventoryRecord.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.inventoryRecord.findMany).not.toHaveBeenCalled();
    });
  });
});
