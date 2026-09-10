import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProductStatus } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { ProductsService } from './products.service';

function buildPrisma(): {
  product: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
  productVariant: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  productVariantAttributeValue: {
    createMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  productMedia: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
  };
  mediaAsset: { findUnique: jest.Mock };
  $transaction: jest.Mock;
} {
  const prisma = {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    productVariant: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    productVariantAttributeValue: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    productMedia: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    mediaAsset: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  // Runs the callback with `prisma` standing in for the transaction client.
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => unknown) => callback(prisma),
  );
  return prisma;
}

describe('ProductsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: ProductsService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new ProductsService(prisma as unknown as PrismaService);
  });

  describe('findPublished', () => {
    it('resolves the current price for each published offer and paginates the result', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'Widget',
          slug: 'widget',
          description: null,
          status: ProductStatus.PUBLISHED,
          brand: null,
          category: null,
          media: [],
          variants: [
            {
              id: 'v1',
              skuCode: 'WID-1',
              name: null,
              status: ProductStatus.PUBLISHED,
              attributeValues: [],
              offers: [
                {
                  id: 'o1',
                  status: ProductStatus.PUBLISHED,
                  prices: [
                    {
                      id: 'price-1',
                      amount: 500,
                      currency: 'USD',
                      startsAt: new Date(Date.now() - 1000),
                      endsAt: null,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]);
      prisma.product.count.mockResolvedValue(1);

      const result = await service.findPublished({ page: 1, limit: 20 });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ProductStatus.PUBLISHED,
          }) as object,
        }),
      );
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
      expect(result.data[0]?.variants[0]?.offers[0]?.currentPrice).toEqual({
        amount: 500,
        currency: 'USD',
      });
    });

    it('filters by category slug, brand slug, and search text', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findPublished({
        page: 1,
        limit: 20,
        categorySlug: 'shoes',
        brandSlug: 'acme',
        q: 'red',
      });

      expect(prisma.product.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          category: { slug: 'shoes' },
          brand: { slug: 'acme' },
          OR: expect.any(Array) as unknown[],
        }) as object,
      });
    });
  });

  describe('findPublishedBySlug', () => {
    it('throws not found when no published product matches', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.findPublishedBySlug('missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('maps a duplicate slug to a conflict', async () => {
      prisma.product.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.create({ name: 'Widget', slug: 'widget' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('addVariant', () => {
    it('creates the variant and its attribute-value links in one transaction', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.productVariant.create.mockResolvedValue({
        id: 'v1',
        productId: 'p1',
      });
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        skuCode: 'WID-1',
        name: null,
        status: ProductStatus.DRAFT,
        attributeValues: [],
        offers: [],
      });

      await service.addVariant('p1', {
        skuCode: 'WID-1',
        attributeValueIds: ['attr-value-1'],
      });

      expect(
        prisma.productVariantAttributeValue.createMany,
      ).toHaveBeenCalledWith({
        data: [{ variantId: 'v1', attributeValueId: 'attr-value-1' }],
      });
    });

    it('maps a duplicate SKU code to a conflict', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.$transaction.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.addVariant('p1', { skuCode: 'DUPLICATE' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('attachMedia', () => {
    it('rejects when the media asset does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.mediaAsset.findUnique.mockResolvedValue(null);

      await expect(
        service.attachMedia('p1', { mediaAssetId: 'missing' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the media asset is not yet available', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.mediaAsset.findUnique.mockResolvedValue({
        id: 'm1',
        status: 'PENDING_UPLOAD',
      });

      await expect(
        service.attachMedia('p1', { mediaAssetId: 'm1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
