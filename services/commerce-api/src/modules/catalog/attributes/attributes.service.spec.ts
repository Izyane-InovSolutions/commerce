import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AttributesService } from './attributes.service';

describe('AttributesService value ownership', () => {
  const prisma = {
    attribute: { findUnique: jest.fn() },
    attributeValue: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const service = new AttributesService(prisma as unknown as PrismaService);
  beforeEach(() => jest.resetAllMocks());
  it('cannot update or remove a value from another attribute', async () => {
    prisma.attributeValue.findUnique.mockResolvedValue({
      attributeId: 'other',
    });
    await expect(
      service.updateValue('attr', 'value', { value: 'Changed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeValue('attr', 'value')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.attributeValue.update).not.toHaveBeenCalled();
    expect(prisma.attributeValue.delete).not.toHaveBeenCalled();
  });
  it('maps duplicate values to a conflict', async () => {
    prisma.attribute.findUnique.mockResolvedValue({ id: 'attr' });
    prisma.attributeValue.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.addValue('attr', { value: 'Red' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
