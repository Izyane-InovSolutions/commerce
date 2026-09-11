import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import { AddressesService } from './addresses.service';

function buildPrisma(): {
  address: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
  };
  $transaction: jest.Mock;
} {
  const prisma = {
    address: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => unknown) => callback(prisma),
  );
  return prisma;
}

describe('AddressesService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: AddressesService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new AddressesService(prisma as unknown as PrismaService);
  });

  describe('findOne', () => {
    it('throws not found when the address belongs to a different user', async () => {
      prisma.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'user-2',
      });

      await expect(service.findOne('user-1', 'addr-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws not found when the address does not exist', async () => {
      prisma.address.findUnique.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('makes the first address for a user the default regardless of input', async () => {
      prisma.address.count.mockResolvedValue(0);
      prisma.address.create.mockResolvedValue({
        id: 'addr-1',
        isDefault: true,
      });

      await service.create('user-1', {
        recipientName: 'A',
        line1: 'L1',
        city: 'C',
        postalCode: '00000',
        country: 'US',
      });

      expect(prisma.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDefault: true }) as object,
        }),
      );
    });

    it('does not default a subsequent address', async () => {
      prisma.address.count.mockResolvedValue(1);
      prisma.address.create.mockResolvedValue({
        id: 'addr-2',
        isDefault: false,
      });

      await service.create('user-1', {
        recipientName: 'A',
        line1: 'L1',
        city: 'C',
        postalCode: '00000',
        country: 'US',
      });

      expect(prisma.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDefault: false }) as object,
        }),
      );
    });
  });

  describe('remove', () => {
    it('promotes the most recently updated remaining address when the default is deleted', async () => {
      prisma.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'user-1',
        isDefault: true,
      });
      prisma.address.findFirst.mockResolvedValue({ id: 'addr-2' });

      await service.remove('user-1', 'addr-1');

      expect(prisma.address.delete).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
      });
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-2' },
        data: { isDefault: true },
      });
    });

    it('does not touch other addresses when a non-default address is deleted', async () => {
      prisma.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'user-1',
        isDefault: false,
      });

      await service.remove('user-1', 'addr-1');

      expect(prisma.address.update).not.toHaveBeenCalled();
    });

    it('leaves no default when the last address is deleted', async () => {
      prisma.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'user-1',
        isDefault: true,
      });
      prisma.address.findFirst.mockResolvedValue(null);

      await service.remove('user-1', 'addr-1');

      expect(prisma.address.update).not.toHaveBeenCalled();
    });
  });

  describe('setDefault', () => {
    it('unsets the previous default before setting the new one', async () => {
      prisma.address.findUnique.mockResolvedValue({
        id: 'addr-2',
        userId: 'user-1',
      });
      prisma.address.update.mockResolvedValue({
        id: 'addr-2',
        isDefault: true,
      });

      await service.setDefault('user-1', 'addr-2');

      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-2' },
        data: { isDefault: true },
      });
    });

    it('rejects setting another user’s address as default', async () => {
      prisma.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'user-2',
      });

      await expect(
        service.setDefault('user-1', 'addr-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
