import { MediaService } from '../media/media.service';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProductStatus, ReviewVisibility, SellerStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import type { CategoryAttributesService } from '../catalog/categories/category-attributes.service';
import type { InventoryService } from '../inventory/inventory.service';
import type { SellersService } from '../sellers/sellers.service';
import { ProductsService } from './products.service';

function buildInventory(): {
  getAvailableQuantities: jest.Mock;
  getAvailableOfferQuantities: jest.Mock;
} {
  return {
    getAvailableQuantities: jest.fn().mockResolvedValue(new Map()),
    getAvailableOfferQuantities: jest.fn().mockResolvedValue(new Map()),
  };
}

function buildPrisma(): {
  product: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
  productVariant: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
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
  mediaAsset: { findUnique: jest.Mock; updateMany: jest.Mock };
  productRatingSummary: { findMany: jest.Mock };
  productReview: { findMany: jest.Mock; count: jest.Mock };
  orderItem: { count: jest.Mock };
  inventoryRecord: { count: jest.Mock };
  attributeValue: { findMany: jest.Mock };
  category: { findMany: jest.Mock };
  inventoryMovement: { count: jest.Mock };
  reservation: { count: jest.Mock };
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
} {
  const prisma = {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn(),
      count: jest.fn(),
    },
    productRatingSummary: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    productReview: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    productVariant: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
    mediaAsset: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderItem: { count: jest.fn().mockResolvedValue(0) },
    inventoryRecord: { count: jest.fn().mockResolvedValue(0) },
    attributeValue: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    inventoryMovement: { count: jest.fn().mockResolvedValue(0) },
    reservation: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'locked' }]),
  };
  // Runs the callback with `prisma` standing in for the transaction client.
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => unknown) => callback(prisma),
  );
  return prisma;
}

describe('ProductsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let inventory: ReturnType<typeof buildInventory>;
  let sellers: { requireApproved: jest.Mock; mine: jest.Mock };
  let categoryAttributes: { effective: jest.Mock };
  let service: ProductsService;

  beforeEach(() => {
    prisma = buildPrisma();
    inventory = buildInventory();
    sellers = { requireApproved: jest.fn(), mine: jest.fn() };
    categoryAttributes = { effective: jest.fn().mockResolvedValue([]) };
    service = new ProductsService(
      prisma as unknown as PrismaService,
      new MediaService(
        prisma as unknown as PrismaService,
        new ConfigService(),
        {} as never,
      ),
      inventory as unknown as InventoryService,
      sellers as unknown as SellersService,
      categoryAttributes as unknown as CategoryAttributesService,
    );
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
                  stockSource: 'PLATFORM',
                  shippingAmount: null,
                  shippingCurrency: null,
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
      inventory.getAvailableQuantities.mockResolvedValue(new Map([['v1', 3]]));

      const result = await service.findPublished({
        page: 1,
        limit: 20,
        currency: 'USD',
      });

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
      expect(result.data[0]?.variants[0]?.offers[0]?.inStock).toBe(true);
      expect(inventory.getAvailableQuantities).toHaveBeenCalledWith(['v1']);
    });

    it('marks an offer out of stock once available quantity runs out', async () => {
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
                  stockSource: 'PLATFORM',
                  shippingAmount: 1500,
                  shippingCurrency: 'USD',
                  prices: [],
                },
              ],
            },
          ],
        },
      ]);
      prisma.product.count.mockResolvedValue(1);
      inventory.getAvailableQuantities.mockResolvedValue(new Map([['v1', 0]]));

      const result = await service.findPublished({
        page: 1,
        limit: 20,
        currency: 'USD',
      });

      expect(result.data[0]?.variants[0]?.offers[0]?.inStock).toBe(false);
      expect(result.data[0]?.variants[0]?.offers[0]?.shippingCost).toEqual({
        amount: 1500,
        currency: 'USD',
      });
    });

    it('queries offers eligible for the public catalog — the platform’s own, or an approved seller’s with a complete storefront', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findPublished({ page: 1, limit: 20, currency: 'USD' });

      const findManyCall = prisma.product.findMany.mock.calls[0] as [
        {
          include: {
            variants: {
              include: { offers: { where: Record<string, unknown> } };
            };
          };
        },
      ];
      const call = findManyCall[0];
      expect(call.include.variants.include.offers.where).toEqual(
        expect.objectContaining({
          status: ProductStatus.PUBLISHED,
          OR: [
            { sellerId: null },
            {
              seller: {
                is: {
                  status: SellerStatus.APPROVED,
                  storefrontSlug: { not: null },
                  displayName: { not: null },
                  ownerUser: { isActive: true },
                },
              },
            },
          ],
        }),
      );
    });

    it('marks a seller-owned offer as such and carries its storefront', async () => {
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
                  sellerId: 'seller-1',
                  stockSource: 'SELLER',
                  shippingAmount: null,
                  shippingCurrency: null,
                  seller: {
                    id: 'seller-1',
                    storefrontSlug: 'acme',
                    displayName: 'Acme',
                    description: null,
                  },
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
      inventory.getAvailableOfferQuantities.mockResolvedValue(
        new Map([['o1', 2]]),
      );

      const result = await service.findPublished({
        page: 1,
        limit: 20,
        currency: 'USD',
      });

      const offer = result.data[0]?.variants[0]?.offers[0];
      expect(offer?.isFirstParty).toBe(false);
      expect(offer?.seller).toEqual({
        id: 'seller-1',
        storefrontSlug: 'acme',
        displayName: 'Acme',
        description: null,
      });
      expect(offer?.inStock).toBe(true);
      expect(inventory.getAvailableOfferQuantities).toHaveBeenCalledWith([
        'o1',
      ]);
    });

    it('filters by category (sub-categories included), brand slug, and search text', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);
      prisma.category.findMany.mockResolvedValue([
        { id: 'shoes', slug: 'shoes', parentId: null },
        { id: 'running', slug: 'running-shoes', parentId: 'shoes' },
        { id: 'trail', slug: 'trail', parentId: 'running' },
        { id: 'hats', slug: 'hats', parentId: null },
      ]);

      await service.findPublished({
        currency: 'USD',
        page: 1,
        limit: 20,
        categorySlug: 'shoes',
        brandSlug: 'acme',
        q: 'red',
      });

      expect(prisma.product.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          categoryId: { in: ['shoes', 'running', 'trail'] },
          brand: { slug: 'acme' },
          AND: [{ OR: expect.any(Array) as unknown[] }],
        }) as object,
      });
    });

    it('also matches an approved seller’s storefront name, so searching for the seller finds their listings', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findPublished({
        currency: 'USD',
        page: 1,
        limit: 20,
        q: 'Acme',
      });

      const countCall = prisma.product.count.mock.calls[0] as [
        { where: { AND: { OR: unknown[] }[] } },
      ];
      const call = countCall[0];
      expect(call.where.AND[0]?.OR).toContainEqual({
        variants: {
          some: {
            status: ProductStatus.PUBLISHED,
            offers: {
              some: {
                status: ProductStatus.PUBLISHED,
                seller: {
                  is: {
                    displayName: { contains: 'Acme', mode: 'insensitive' },
                    status: SellerStatus.APPROVED,
                    storefrontSlug: { not: null },
                    ownerUser: { isActive: true },
                  },
                },
              },
            },
          },
        },
      });
    });

    describe('multi-term search', () => {
      async function searchWhere(q: string): Promise<Record<string, unknown>> {
        prisma.product.findMany.mockResolvedValue([]);
        prisma.product.count.mockResolvedValue(0);
        await service.findPublished({ currency: 'USD', page: 1, limit: 20, q });
        const [countArgs] = prisma.product.count.mock.calls[0] as [
          { where: Record<string, unknown> },
        ];
        return countArgs.where;
      }

      function termFields(term: string): unknown[] {
        const matches = { contains: term, mode: 'insensitive' };
        return [
          { name: matches },
          { description: matches },
          { brand: { name: matches } },
          { category: { name: matches } },
          {
            variants: {
              some: { status: ProductStatus.PUBLISHED, skuCode: matches },
            },
          },
          {
            variants: {
              some: {
                status: ProductStatus.PUBLISHED,
                offers: {
                  some: {
                    status: ProductStatus.PUBLISHED,
                    seller: {
                      is: {
                        displayName: matches,
                        status: SellerStatus.APPROVED,
                        storefrontSlug: { not: null },
                        ownerUser: { isActive: true },
                      },
                    },
                  },
                },
              },
            },
          },
        ];
      }

      it('requires every term to match, each on any searchable field', async () => {
        const where = await searchWhere('  acme   Red ');

        expect(where.AND).toEqual([
          { OR: termFields('acme') },
          { OR: termFields('Red') },
        ]);
        expect(where.OR).toBeUndefined();
      });

      it('keeps the other filters and published-only status alongside the terms', async () => {
        prisma.product.findMany.mockResolvedValue([]);
        prisma.product.count.mockResolvedValue(0);

        await service.findPublished({
          currency: 'USD',
          page: 1,
          limit: 20,
          q: 'red shoes',
          brandSlug: 'acme',
        });

        const [countArgs] = prisma.product.count.mock.calls[0] as [
          { where: Record<string, unknown> },
        ];
        expect(countArgs.where).toMatchObject({
          status: ProductStatus.PUBLISHED,
          brand: { slug: 'acme' },
        });
        expect(countArgs.where.AND).toHaveLength(2);
      });

      it('applies no text filter when the query has no usable terms', async () => {
        const where = await searchWhere('   ,, -- ');

        expect(where.AND).toBeUndefined();
        expect(where.OR).toBeUndefined();
      });

      it('leaves ordering exactly as it was without a search', async () => {
        prisma.product.findMany.mockResolvedValue([]);
        prisma.product.count.mockResolvedValue(0);

        await service.findPublished({
          currency: 'USD',
          page: 1,
          limit: 20,
          q: 'red shoes',
          sort: 'name:asc',
        });

        expect(prisma.product.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ orderBy: [{ name: 'asc' }] }),
        );
      });
    });
  });

  describe('findPublishedBySlug', () => {
    it('throws not found when no published product matches', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.findPublishedBySlug('missing', 'USD'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    const baseProduct = {
      id: 'p1',
      name: 'Widget',
      slug: 'widget',
      description: null,
      status: ProductStatus.PUBLISHED,
      brand: null,
      category: null,
      media: [],
      variants: [],
    };

    it('defaults to null average and zero counts when no summary row exists', async () => {
      prisma.product.findFirst.mockResolvedValue(baseProduct);
      prisma.productRatingSummary.findMany.mockResolvedValue([]);

      const result = await service.findPublishedBySlug('widget', 'USD');

      expect(result.averageRating).toBeNull();
      expect(result.ratingCount).toBe(0);
      expect(result.ratingHistogram).toEqual({
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      });
    });

    it('computes averageRating from ratingSum/ratingCount and reports the histogram', async () => {
      prisma.product.findFirst.mockResolvedValue(baseProduct);
      prisma.productRatingSummary.findMany.mockResolvedValue([
        {
          productId: 'p1',
          ratingCount: 4,
          ratingSum: 18,
          star1Count: 0,
          star2Count: 1,
          star3Count: 0,
          star4Count: 1,
          star5Count: 2,
          version: 0,
          recalculatedAt: new Date(),
        },
      ]);

      const result = await service.findPublishedBySlug('widget', 'USD');

      expect(result.averageRating).toBe(4.5);
      expect(result.ratingCount).toBe(4);
      expect(result.ratingHistogram).toEqual({
        1: 0,
        2: 1,
        3: 0,
        4: 1,
        5: 2,
      });
    });
  });

  describe('findPublicReviews', () => {
    it('throws not found when no published product matches the slug', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.findPublicReviews('missing', { page: 1, limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('projects only the public shape and never leaks private fields', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Widget',
        slug: 'widget',
      });
      prisma.productReview.findMany.mockResolvedValue([
        {
          id: 'r1',
          rating: 5,
          title: 'Great',
          body: 'Loved it',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
          author: { firstName: 'Jane', lastName: 'Doe' },
          seller: { id: 's1', displayName: 'Acme Co' },
        },
      ]);
      prisma.productReview.count.mockResolvedValue(1);

      const result = await service.findPublicReviews('widget', {
        page: 1,
        limit: 20,
      });

      expect(prisma.productReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            productId: 'p1',
            visibility: ReviewVisibility.PUBLISHED,
          }) as object,
        }),
      );
      expect(result.data).toEqual([
        {
          id: 'r1',
          rating: 5,
          title: 'Great',
          body: 'Loved it',
          reviewerLabel: 'Jane D.',
          verifiedPurchase: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
          product: { id: 'p1', name: 'Widget', slug: 'widget' },
          seller: { id: 's1', displayName: 'Acme Co' },
        },
      ]);
      const leaked = result.data[0] as unknown as Record<string, unknown>;
      expect(leaked.authorUserId).toBeUndefined();
      expect(leaked.orderItemId).toBeUndefined();
      expect(leaked.moderationState).toBeUndefined();
      expect(leaked.version).toBeUndefined();
    });

    it('excludes HIDDEN/REMOVED/WITHDRAWN reviews via the visibility filter', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Widget',
        slug: 'widget',
      });
      prisma.productReview.findMany.mockResolvedValue([]);
      prisma.productReview.count.mockResolvedValue(0);

      await service.findPublicReviews('widget', { page: 1, limit: 20 });

      const where = (
        prisma.productReview.findMany.mock.calls[0] as [
          { where: { visibility: ReviewVisibility } },
        ]
      )[0].where;
      expect(where.visibility).toBe(ReviewVisibility.PUBLISHED);
      expect(where.visibility).not.toBe(ReviewVisibility.HIDDEN);
      expect(where.visibility).not.toBe(ReviewVisibility.REMOVED);
      expect(where.visibility).not.toBe(ReviewVisibility.WITHDRAWN);
    });

    it('applies an exact-match star filter when rating is given', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Widget',
        slug: 'widget',
      });
      prisma.productReview.findMany.mockResolvedValue([]);
      prisma.productReview.count.mockResolvedValue(0);

      await service.findPublicReviews('widget', {
        page: 1,
        limit: 20,
        rating: 4,
      });

      expect(prisma.productReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ rating: 4 }) as object,
        }),
      );
    });

    it.each([
      ['newest', [{ createdAt: 'desc' }]],
      ['oldest', [{ createdAt: 'asc' }]],
      ['highest', [{ rating: 'desc' }, { createdAt: 'desc' }]],
      ['lowest', [{ rating: 'asc' }, { createdAt: 'desc' }]],
    ] as const)(
      'maps sort=%s to the expected orderBy',
      async (sort, expected) => {
        prisma.product.findFirst.mockResolvedValue({
          id: 'p1',
          name: 'Widget',
          slug: 'widget',
        });
        prisma.productReview.findMany.mockResolvedValue([]);
        prisma.productReview.count.mockResolvedValue(0);

        await service.findPublicReviews('widget', { page: 1, limit: 20, sort });

        expect(prisma.productReview.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ orderBy: expected }),
        );
      },
    );

    it('paginates using page/limit for skip/take', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Widget',
        slug: 'widget',
      });
      prisma.productReview.findMany.mockResolvedValue([]);
      prisma.productReview.count.mockResolvedValue(0);

      await service.findPublicReviews('widget', { page: 3, limit: 10 });

      expect(prisma.productReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
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
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', media: [] });
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
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', media: [] });
      prisma.$transaction.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.addVariant('p1', { skuCode: 'DUPLICATE' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove / removeVariant', () => {
    beforeEach(() => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', media: [] });
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        productId: 'p1',
      });
    });

    it('deletes a product that has never sold or held stock', async () => {
      await service.remove('p1');

      expect(prisma.orderItem.count).toHaveBeenCalledWith({
        where: { offer: { variant: { productId: 'p1' } } },
      });
      expect(prisma.product.delete).toHaveBeenCalledWith({
        where: { id: 'p1' },
      });
    });

    it('refuses to delete a product with order history', async () => {
      prisma.orderItem.count.mockResolvedValue(3);

      await expect(service.remove('p1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a variant with stock movements', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(1);

      await expect(service.removeVariant('p1', 'v1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.inventoryMovement.count).toHaveBeenCalledWith({
        where: { inventoryRecord: { variant: { id: 'v1' } } },
      });
      expect(prisma.productVariant.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a variant with a reservation', async () => {
      prisma.reservation.count.mockResolvedValue(1);

      await expect(service.removeVariant('p1', 'v1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.productVariant.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a variant with nonzero stock', async () => {
      prisma.inventoryRecord.count.mockResolvedValue(1);

      await expect(service.removeVariant('p1', 'v1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.productVariant.delete).not.toHaveBeenCalled();
    });

    it('maps a restricting foreign key to the same conflict', async () => {
      prisma.productVariant.delete.mockRejectedValue({ code: 'P2003' });

      await expect(service.removeVariant('p1', 'v1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('maps a concurrent disappearance to not found', async () => {
      prisma.productVariant.delete.mockRejectedValue({ code: 'P2025' });

      await expect(service.removeVariant('p1', 'v1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('category attribute rules on variants', () => {
    const rule = (
      attributeId: string,
      name: string,
      isRequired: boolean,
    ): Record<string, unknown> => ({
      attributeId,
      code: name.toLowerCase(),
      name,
      isRequired,
      inheritedFrom: null,
      values: [],
    });
    const value = (
      id: string,
      attributeId: string,
      name: string,
    ): Record<string, unknown> => ({
      id,
      value: id,
      attributeId,
      attribute: { name },
    });

    beforeEach(() => {
      // findByIdAdmin, then the rule lookup inside the transaction.
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        media: [],
        category: { id: 'phones', name: 'Smartphones' },
      });
      categoryAttributes.effective.mockResolvedValue([
        rule('color', 'Color', true),
        rule('storage', 'Storage', true),
        rule('carrier', 'Carrier', false),
      ]);
      prisma.productVariant.create.mockResolvedValue({ id: 'v1' });
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        attributeValues: [],
        offers: [],
      });
    });

    it('accepts one value per attribute with every required one present', async () => {
      prisma.attributeValue.findMany.mockResolvedValue([
        value('black', 'color', 'Color'),
        value('256', 'storage', 'Storage'),
      ]);

      await service.addVariant('p1', {
        skuCode: 'P-BLK-256',
        attributeValueIds: ['black', '256'],
      });

      expect(prisma.productVariant.create).toHaveBeenCalled();
    });

    it('refuses a variant missing a required attribute', async () => {
      prisma.attributeValue.findMany.mockResolvedValue([
        value('black', 'color', 'Color'),
      ]);

      await expect(
        service.addVariant('p1', {
          skuCode: 'P-BLK',
          attributeValueIds: ['black'],
        }),
      ).rejects.toThrow('Variants in Smartphones need Storage');
      expect(prisma.productVariant.create).not.toHaveBeenCalled();
    });

    it("refuses an attribute the category doesn't use", async () => {
      prisma.attributeValue.findMany.mockResolvedValue([
        value('black', 'color', 'Color'),
        value('256', 'storage', 'Storage'),
        value('xl', 'size', 'Size'),
      ]);

      await expect(
        service.addVariant('p1', {
          skuCode: 'P-BLK-256-XL',
          attributeValueIds: ['black', '256', 'xl'],
        }),
      ).rejects.toThrow("Size isn't an attribute of Smartphones");
    });

    it('refuses two values of the same attribute', async () => {
      prisma.attributeValue.findMany.mockResolvedValue([
        value('black', 'color', 'Color'),
        value('silver', 'color', 'Color'),
        value('256', 'storage', 'Storage'),
      ]);

      await expect(
        service.addVariant('p1', {
          skuCode: 'P-X',
          attributeValueIds: ['black', 'silver', '256'],
        }),
      ).rejects.toThrow('A variant can have only one Color');
    });

    it('refuses a combination another variant already has', async () => {
      prisma.attributeValue.findMany.mockResolvedValue([
        value('black', 'color', 'Color'),
        value('256', 'storage', 'Storage'),
      ]);
      prisma.productVariant.findMany.mockResolvedValue([
        {
          skuCode: 'P-BLK-256',
          attributeValues: [
            { attributeValueId: '256' },
            { attributeValueId: 'black' },
          ],
        },
      ]);

      await expect(
        service.addVariant('p1', {
          skuCode: 'P-BLK-256-2',
          attributeValueIds: ['black', '256'],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('leaves a product without category rules unrestricted', async () => {
      categoryAttributes.effective.mockResolvedValue([]);

      await service.addVariant('p1', { skuCode: 'P-ANY' });

      expect(prisma.attributeValue.findMany).not.toHaveBeenCalled();
      expect(prisma.productVariant.create).toHaveBeenCalled();
    });
  });

  describe('attachMedia', () => {
    it('rejects when the media asset does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', media: [] });
      prisma.mediaAsset.findUnique.mockResolvedValue(null);

      await expect(
        service.attachMedia('p1', { mediaAssetId: 'missing' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the media asset is not yet available', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', media: [] });
      prisma.mediaAsset.findUnique.mockResolvedValue({
        id: 'm1',
        status: 'PENDING_UPLOAD',
      });

      await expect(
        service.attachMedia('p1', { mediaAssetId: 'm1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('submitProduct', () => {
    it('rejects a caller who is not an approved seller', async () => {
      sellers.requireApproved.mockRejectedValue(new Error('not approved'));

      await expect(
        service.submitProduct('user-1', { name: 'Widget', slug: 'widget' }),
      ).rejects.toThrow('not approved');
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('creates the product tagged with the seller and pending review', async () => {
      sellers.requireApproved.mockResolvedValue({ id: 'seller-1' });
      sellers.mine.mockResolvedValue({ id: 'seller-1' });
      prisma.product.create.mockResolvedValue({ id: 'p1' });
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        createdBySellerId: 'seller-1',
        media: [],
      });

      await service.submitProduct('user-1', {
        name: 'Widget',
        slug: 'widget',
      });

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Widget',
          slug: 'widget',
          createdBySellerId: 'seller-1',
          submissionStatus: 'PENDING',
        }) as object,
      });
    });
  });

  describe('addSellerVariant / attachSellerMedia ownership', () => {
    it('rejects adding a variant to a product submitted by another seller', async () => {
      sellers.requireApproved.mockResolvedValue({ id: 'seller-1' });
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        createdBySellerId: 'someone-else',
        submissionStatus: 'PENDING',
      });

      await expect(
        service.addSellerVariant('user-1', 'p1', { skuCode: 'SKU-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.productVariant.create).not.toHaveBeenCalled();
    });

    it('rejects adding a variant once the submission has already been reviewed', async () => {
      sellers.requireApproved.mockResolvedValue({ id: 'seller-1' });
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        createdBySellerId: 'seller-1',
        submissionStatus: 'APPROVED',
      });

      await expect(
        service.addSellerVariant('user-1', 'p1', { skuCode: 'SKU-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('adds the variant once ownership and pending state check out', async () => {
      sellers.requireApproved.mockResolvedValue({ id: 'seller-1' });
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        createdBySellerId: 'seller-1',
        submissionStatus: 'PENDING',
      });
      prisma.productVariant.create.mockResolvedValue({ id: 'v1' });
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        attributeValues: [],
        offers: [],
      });

      const result = await service.addSellerVariant('user-1', 'p1', {
        skuCode: 'SKU-1',
      });

      expect(result.id).toBe('v1');
      expect(prisma.productVariant.create).toHaveBeenCalledWith({
        data: { productId: 'p1', skuCode: 'SKU-1', name: undefined },
      });
    });

    it('rejects attaching a media asset the seller does not own', async () => {
      sellers.requireApproved.mockResolvedValue({ id: 'seller-1' });
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        createdBySellerId: 'seller-1',
        submissionStatus: 'PENDING',
      });
      prisma.mediaAsset.findUnique.mockResolvedValue({
        id: 'm1',
        status: 'AVAILABLE',
        verificationLocked: false,
        ownerUserId: 'someone-else',
      });

      await expect(
        service.attachSellerMedia('user-1', 'p1', { mediaAssetId: 'm1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('reviewSubmission', () => {
    it('rejects a submission that is not pending (already reviewed, or concurrently reviewed)', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        createdBySellerId: 'seller-1',
      });
      prisma.product.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reviewSubmission('admin-1', 'p1', 'APPROVED', {
          reason: 'Looks good',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.productVariant.updateMany).not.toHaveBeenCalled();
    });

    it('rejects reviewing a product nobody submitted', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        createdBySellerId: null,
      });

      await expect(
        service.reviewSubmission('admin-1', 'p1', 'APPROVED', {
          reason: 'Looks good',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('approving publishes the product and every variant on it', async () => {
      prisma.product.findUnique
        .mockResolvedValueOnce({ id: 'p1', createdBySellerId: 'seller-1' })
        .mockResolvedValueOnce({ id: 'p1', media: [] });

      await service.reviewSubmission('admin-1', 'p1', 'APPROVED', {
        reason: 'Looks good',
      });

      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', submissionStatus: 'PENDING' },
        data: expect.objectContaining({
          submissionStatus: 'APPROVED',
          reviewReason: 'Looks good',
          reviewedBy: 'admin-1',
          status: 'PUBLISHED',
        }) as object,
      });
      expect(prisma.productVariant.updateMany).toHaveBeenCalledWith({
        where: { productId: 'p1' },
        data: { status: 'PUBLISHED' },
      });
    });

    it('rejecting leaves the product as a draft, without touching its variants', async () => {
      prisma.product.findUnique
        .mockResolvedValueOnce({ id: 'p1', createdBySellerId: 'seller-1' })
        .mockResolvedValueOnce({ id: 'p1', media: [] });

      await service.reviewSubmission('admin-1', 'p1', 'REJECTED', {
        reason: 'Missing details',
      });

      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', submissionStatus: 'PENDING' },
        data: expect.objectContaining({
          submissionStatus: 'REJECTED',
          reviewReason: 'Missing details',
        }) as object,
      });
      expect(prisma.productVariant.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('findBestSellers', () => {
    const publishedProduct = (id: string): Record<string, unknown> => ({
      id,
      name: `Product ${id}`,
      slug: id,
      description: null,
      status: ProductStatus.PUBLISHED,
      isReturnable: true,
      returnWindowDays: null,
      brand: null,
      category: null,
      media: [],
      variants: [
        {
          id: `${id}-v`,
          skuCode: `${id}-SKU`,
          name: null,
          status: ProductStatus.PUBLISHED,
          attributeValues: [],
          offers: [
            {
              id: `${id}-o`,
              status: ProductStatus.PUBLISHED,
              sellerId: null,
              stockSource: 'PLATFORM',
              shippingAmount: null,
              shippingCurrency: null,
              prices: [
                {
                  id: `${id}-price`,
                  amount: 1500,
                  currency: 'ZMW',
                  startsAt: new Date(Date.now() - 1000),
                  endsAt: null,
                },
              ],
            },
          ],
        },
      ],
    });

    it('returns an empty list without loading products when nothing sold', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.findBestSellers({ limit: 24, days: 30, currency: 'ZMW' }),
      ).resolves.toEqual({ items: [] });
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('keeps sales rank order, skips ineligible products and maps items like the listing', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { productId: 'p-top' },
        { productId: 'p-hidden' },
        { productId: 'p-second' },
      ]);
      prisma.product.findMany
        // Eligibility check: the hidden product's only seller isn't approved.
        .mockResolvedValueOnce([{ id: 'p-second' }, { id: 'p-top' }])
        // Full load comes back in arbitrary order.
        .mockResolvedValueOnce([
          publishedProduct('p-second'),
          publishedProduct('p-top'),
        ]);

      const result = await service.findBestSellers({
        limit: 24,
        days: 30,
        currency: 'ZMW',
      });

      expect(result.items.map((item) => item.id)).toEqual([
        'p-top',
        'p-second',
      ]);
      expect(result.items[0]?.variants[0]?.offers[0]?.currentPrice).toEqual({
        amount: 1500,
        currency: 'ZMW',
      });
      expect(result.items[0]).toHaveProperty('ratingHistogram');
      const eligibilityWhere = (
        prisma.product.findMany.mock.calls[0] as [
          { where: Record<string, unknown> },
        ]
      )[0].where;
      expect(eligibilityWhere).toMatchObject({
        id: { in: ['p-top', 'p-hidden', 'p-second'] },
        status: ProductStatus.PUBLISHED,
      });
    });

    it('stops at the requested limit', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { productId: 'a' },
        { productId: 'b' },
        { productId: 'c' },
      ]);
      prisma.product.findMany
        .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
        .mockResolvedValueOnce([publishedProduct('a'), publishedProduct('b')]);

      await service.findBestSellers({ limit: 2, days: 7, currency: 'ZMW' });

      expect(prisma.product.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: { in: ['a', 'b'] } } }),
      );
    });
  });

  describe('seller product edits', () => {
    beforeEach(() => {
      sellers.requireApproved.mockResolvedValue({ id: 'seller-1' });
      sellers.mine.mockResolvedValue({ id: 'seller-1' });
    });

    it('404s for a product submitted by another seller', async () => {
      prisma.product.findUnique.mockResolvedValue({
        createdBySellerId: 'someone-else',
      });

      await expect(
        service.updateSellerProduct('user-1', 'p1', { name: 'New' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('edits a pending or rejected submission and (re)queues it for review', async () => {
      prisma.product.findUnique
        .mockResolvedValueOnce({ createdBySellerId: 'seller-1' })
        .mockResolvedValueOnce({
          id: 'p1',
          createdBySellerId: 'seller-1',
          media: [],
        });

      await service.updateSellerProduct('user-1', 'p1', {
        name: 'Better name',
        brandId: null,
      });

      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'p1',
          createdBySellerId: 'seller-1',
          submissionStatus: { in: ['PENDING', 'REJECTED'] },
        },
        data: {
          submissionStatus: 'PENDING',
          reviewReason: null,
          reviewedBy: null,
          reviewedAt: null,
        },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { name: 'Better name', brandId: null },
      });
    });

    it('refuses to edit an approved (live) product with 409', async () => {
      prisma.product.findUnique.mockResolvedValue({
        createdBySellerId: 'seller-1',
      });
      prisma.product.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateSellerProduct('user-1', 'p1', { name: 'New' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('edits a variant on the seller own submission', async () => {
      prisma.product.findUnique.mockResolvedValue({
        createdBySellerId: 'seller-1',
      });
      prisma.productVariant.findUnique
        .mockResolvedValueOnce({ id: 'v1', productId: 'p1' })
        .mockResolvedValueOnce({ id: 'v1', attributeValues: [], offers: [] });

      await service.updateSellerVariant('user-1', 'p1', 'v1', {
        skuCode: 'NEW-SKU',
        attributeValueIds: ['av-1'],
      });

      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { skuCode: 'NEW-SKU', name: undefined },
      });
      expect(
        prisma.productVariantAttributeValue.createMany,
      ).toHaveBeenCalledWith({
        data: [{ variantId: 'v1', attributeValueId: 'av-1' }],
      });
    });

    it('404s for a variant that belongs to a different product', async () => {
      prisma.product.findUnique.mockResolvedValue({
        createdBySellerId: 'seller-1',
      });
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        productId: 'other',
      });

      await expect(
        service.updateSellerVariant('user-1', 'p1', 'v1', { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps a duplicate SKU on edit to 409', async () => {
      prisma.product.findUnique.mockResolvedValue({
        createdBySellerId: 'seller-1',
      });
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        productId: 'p1',
      });
      prisma.productVariant.update.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.updateSellerVariant('user-1', 'p1', 'v1', { skuCode: 'DUP' }),
      ).rejects.toThrow('A variant with this SKU code already exists');
    });

    it('deletes an unreviewed submission with no history', async () => {
      prisma.product.findUnique.mockResolvedValue({
        createdBySellerId: 'seller-1',
      });

      await service.removeSellerProduct('user-1', 'p1');

      expect(prisma.product.delete).toHaveBeenCalledWith({
        where: { id: 'p1' },
      });
    });

    it('refuses to delete a product with order or stock history', async () => {
      prisma.product.findUnique.mockResolvedValue({
        createdBySellerId: 'seller-1',
      });
      prisma.orderItem.count.mockResolvedValue(1);

      await expect(
        service.removeSellerProduct('user-1', 'p1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete an approved product', async () => {
      prisma.product.findUnique.mockResolvedValue({
        createdBySellerId: 'seller-1',
      });
      prisma.product.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.removeSellerProduct('user-1', 'p1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });

    it('deletes a variant and resubmits the product', async () => {
      prisma.product.findUnique.mockResolvedValue({
        createdBySellerId: 'seller-1',
      });
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        productId: 'p1',
      });

      await service.removeSellerVariant('user-1', 'p1', 'v1');

      expect(prisma.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            submissionStatus: 'PENDING',
          }) as object,
        }),
      );
      expect(prisma.productVariant.delete).toHaveBeenCalledWith({
        where: { id: 'v1' },
      });
    });

    it('requires an approved seller', async () => {
      sellers.requireApproved.mockRejectedValue(
        new Error('Seller approval is required'),
      );

      await expect(
        service.removeSellerVariant('user-1', 'p1', 'v1'),
      ).rejects.toThrow('Seller approval is required');
      expect(prisma.productVariant.delete).not.toHaveBeenCalled();
    });
  });
});
