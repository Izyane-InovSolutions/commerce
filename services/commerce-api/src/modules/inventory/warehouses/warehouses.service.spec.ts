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
