import { MediaService } from '../media/media.service';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProductStatus, ReviewVisibility, SellerStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
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
  $transaction: jest.Mock;
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
  let inventory: ReturnType<typeof buildInventory>;
  let sellers: { requireApproved: jest.Mock; mine: jest.Mock };
  let service: ProductsService;

  beforeEach(() => {
    prisma = buildPrisma();
    inventory = buildInventory();
    sellers = { requireApproved: jest.fn(), mine: jest.fn() };
    service = new ProductsService(
      prisma as unknown as PrismaService,
      new MediaService(
        prisma as unknown as PrismaService,
        new ConfigService(),
        {} as never,
      ),
      inventory as unknown as InventoryService,
      sellers as unknown as SellersService,
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
      inventory.getAvailableQuantities.mockResolvedValue(
        new Map([['v1', 3]]),
      );

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

    it("marks an offer out of stock once available quantity runs out", async () => {
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

    it('filters by category slug, brand slug, and search text', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

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
          category: { slug: 'shoes' },
          brand: { slug: 'acme' },
          OR: expect.any(Array) as unknown[],
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
        { where: { OR: unknown[] } },
      ];
      const call = countCall[0];
      expect(call.where.OR).toContainEqual({
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
    ] as const)('maps sort=%s to the expected orderBy', async (sort, expected) => {
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
    });

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
});
