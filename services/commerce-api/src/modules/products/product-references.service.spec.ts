import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProductReferencesService } from './product-references.service';

describe('ProductReferencesService', () => {
  const prisma = {
    productVariant: { findUnique: jest.fn(), findFirst: jest.fn() },
    productMedia: { count: jest.fn() },
  };
  const service = new ProductReferencesService(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => jest.resetAllMocks());

  it('requires both the variant and product to be published', async () => {
    prisma.productVariant.findFirst.mockResolvedValue(null);

    await expect(
      service.requirePublishedVariant('variant-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.productVariant.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'variant-1',
        status: 'PUBLISHED',
        product: { status: 'PUBLISHED' },
      },
      select: { id: true },
    });
  });

  it('deduplicates media IDs before checking product assignments', async () => {
    prisma.productMedia.count.mockResolvedValue(1);

    await expect(
      service.hasMediaAssignments(['asset-1', 'asset-1']),
    ).resolves.toBe(true);
    expect(prisma.productMedia.count).toHaveBeenCalledWith({
      where: { mediaAssetId: { in: ['asset-1'] } },
    });
  });
});
