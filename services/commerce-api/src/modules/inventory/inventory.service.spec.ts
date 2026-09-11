import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { BackgroundJobsService } from '../../infrastructure/jobs/background-jobs.service';
import { InventoryService } from './inventory.service';

function buildPrisma(): {
  inventoryRecord: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  inventoryMovement: { create: jest.Mock; findMany: jest.Mock };
  reservation: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
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
    },
    inventoryMovement: { create: jest.fn(), findMany: jest.fn() },
    reservation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => unknown) => callback(prisma),
  );
  return prisma;
}

describe('InventoryService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let backgroundJobsService: { enqueue: jest.Mock };
  let service: InventoryService;

  beforeEach(() => {
    prisma = buildPrisma();
    backgroundJobsService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new InventoryService(
      prisma as unknown as PrismaService,
      backgroundJobsService as unknown as BackgroundJobsService,
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

      await expect(service.adjustStock('w1', 'v1', -5)).rejects.toBeInstanceOf(
        ConflictException,
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
      prisma.reservation.findMany.mockResolvedValue([]);

      await expect(service.reserve('v1', 1)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('sweeps expired reservations before evaluating availability', async () => {
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
});
