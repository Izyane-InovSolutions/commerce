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
  $queryRaw: jest.Mock;
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
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
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
      // One existing address, which is the default.
      prisma.address.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      prisma.address.create.mockResolvedValue({
        id: 'addr-2',
        isDefault: false,
      });

      const created = await service.create('user-1', {
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
      expect(prisma.address.update).not.toHaveBeenCalled();
      expect(created).toEqual({ id: 'addr-2', isDefault: false });
    });

    it('promotes and returns the new address for a user with addresses but no default', async () => {
      prisma.address.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
      prisma.address.create.mockResolvedValue({
        id: 'addr-3',
        isDefault: false,
      });
      prisma.address.findFirst.mockResolvedValue({ id: 'addr-3' });
      prisma.address.update.mockResolvedValue({
        id: 'addr-3',
        isDefault: true,
      });

      const created = await service.create('user-1', {
        recipientName: 'A',
        line1: 'L1',
        city: 'C',
        postalCode: '00000',
        country: 'US',
      });

      expect(prisma.address.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      });
      expect(created).toEqual({ id: 'addr-3', isDefault: true });
    });

    it('returns the created row unchanged when the repair promotes an older address', async () => {
      prisma.address.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
      prisma.address.create.mockResolvedValue({
        id: 'addr-3',
        isDefault: false,
      });
      prisma.address.findFirst.mockResolvedValue({ id: 'addr-1' });
      prisma.address.update.mockResolvedValue({
        id: 'addr-1',
        isDefault: true,
      });

      const created = await service.create('user-1', {
        recipientName: 'A',
        line1: 'L1',
        city: 'C',
        postalCode: '00000',
        country: 'US',
      });

      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
        data: { isDefault: true },
      });
      expect(created).toEqual({ id: 'addr-3', isDefault: false });
    });
  });

  describe('user lock', () => {
    it('locks the users row before counting addresses on create', async () => {
      const calls: string[] = [];
      prisma.$queryRaw.mockImplementation(() => {
        calls.push('lock');
        return Promise.resolve([{ id: 'user-1' }]);
      });
      prisma.address.count.mockImplementation(() => {
        calls.push('count');
        return Promise.resolve(0);
      });
      prisma.address.create.mockResolvedValue({ id: 'addr-1' });

      await service.create('user-1', {
        recipientName: 'A',
        line1: 'L1',
        city: 'C',
        postalCode: '00000',
        country: 'US',
      });

      expect(calls).toEqual(['lock', 'count']);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('checks ownership inside the locked transaction on update', async () => {
      prisma.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'user-2',
      });

      await expect(
        service.update('user-1', 'addr-1', { city: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.address.update).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('never changes the default flag', async () => {
      prisma.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'user-1',
        isDefault: true,
      });
      prisma.address.update.mockResolvedValue({ id: 'addr-1' });

      await service.update('user-1', 'addr-1', {
        city: 'X',
        isDefault: false,
      } as never);

      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
        data: { city: 'X', isDefault: undefined },
      });
    });
  });

  describe('remove', () => {
    it('promotes the most recently updated remaining address when the default is deleted', async () => {
      prisma.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'user-1',
        isDefault: true,
      });
      // The default went with the delete.
      prisma.address.count.mockResolvedValue(0);
      prisma.address.findFirst.mockResolvedValue({ id: 'addr-2' });

      await service.remove('user-1', 'addr-1');

      expect(prisma.address.delete).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
      });
      expect(prisma.address.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
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
      // Another address is still the default.
      prisma.address.count.mockResolvedValue(1);

      await service.remove('user-1', 'addr-1');

      expect(prisma.address.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
      });
      expect(prisma.address.findFirst).not.toHaveBeenCalled();
      expect(prisma.address.update).not.toHaveBeenCalled();
    });

    it('repairs a user left with no default when a non-default address is deleted', async () => {
      prisma.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'user-1',
        isDefault: false,
      });
      prisma.address.count.mockResolvedValue(0);
      prisma.address.findFirst.mockResolvedValue({ id: 'addr-3' });

      await service.remove('user-1', 'addr-1');

      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-3' },
        data: { isDefault: true },
      });
    });

    it('leaves no default when the last address is deleted', async () => {
      prisma.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'user-1',
        isDefault: true,
      });
      prisma.address.count.mockResolvedValue(0);
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
