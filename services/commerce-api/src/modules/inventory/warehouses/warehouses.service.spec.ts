import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { WarehousesService } from './warehouses.service';

describe('WarehousesService write errors', () => {
  const model = { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() };
  const service = new WarehousesService({
    warehouse: model,
  } as unknown as PrismaService);
  beforeEach(() => jest.resetAllMocks());
  it('reports a unique collision as conflict', async () => {
    model.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.create({ name: 'Warehouse', code: 'WH' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('preserves infrastructure errors instead of claiming a duplicate', async () => {
    const failure = new Error('Database unavailable');
    model.create.mockRejectedValue(failure);
    await expect(
      service.create({ name: 'Warehouse', code: 'WH' }),
    ).rejects.toBe(failure);
  });
  it('does not update an unknown record', async () => {
    model.findUnique.mockResolvedValue(null);
    await expect(
      service.update('missing', { name: 'Changed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(model.update).not.toHaveBeenCalled();
  });
});

describe('WarehousesService remove', () => {
  const tx = {
    $queryRaw: jest.fn(),
    inventoryRecord: { count: jest.fn() },
    warehouse: { delete: jest.fn() },
  };
  const prisma = { $transaction: jest.fn() };
  const service = new WarehousesService(prisma as unknown as PrismaService);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    tx.$queryRaw.mockResolvedValue([{ id: 'wh-1' }]);
    tx.inventoryRecord.count.mockResolvedValue(0);
    tx.warehouse.delete.mockResolvedValue({ id: 'wh-1' });
  });
  it('deletes an unused warehouse', async () => {
    await service.remove('wh-1');
    expect(tx.warehouse.delete).toHaveBeenCalledWith({ where: { id: 'wh-1' } });
  });
  it('404s an unknown warehouse', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.warehouse.delete).not.toHaveBeenCalled();
  });
  it('refuses to cascade away stock rows and their movement history', async () => {
    tx.inventoryRecord.count.mockResolvedValue(3);
    await expect(service.remove('wh-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.inventoryRecord.count).toHaveBeenCalledWith({
      where: { warehouseId: 'wh-1' },
    });
    expect(tx.warehouse.delete).not.toHaveBeenCalled();
  });
  it('maps a restricting foreign key (P2003) to conflict instead of 500', async () => {
    tx.warehouse.delete.mockRejectedValue({ code: 'P2003' });
    await expect(service.remove('wh-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('preserves other errors', async () => {
    const failure = new Error('Database unavailable');
    tx.warehouse.delete.mockRejectedValue(failure);
    await expect(service.remove('wh-1')).rejects.toBe(failure);
  });
});
