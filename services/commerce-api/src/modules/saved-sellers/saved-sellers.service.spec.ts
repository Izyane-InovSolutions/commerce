import { BadRequestException } from '@nestjs/common';
import { SellerStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { SavedSellersService } from './saved-sellers.service';

function buildPrisma(): {
  seller: { findUnique: jest.Mock };
  savedSeller: {
    findMany: jest.Mock;
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
} {
  return {
    seller: { findUnique: jest.fn() },
    savedSeller: {
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

describe('SavedSellersService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: SavedSellersService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new SavedSellersService(prisma as unknown as PrismaService);
  });

  describe('add', () => {
    it('rejects saving a seller that does not exist', async () => {
      prisma.seller.findUnique.mockResolvedValue(null);

      await expect(
        service.add('user-1', 'missing-seller'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('is idempotent when the seller is already saved', async () => {
      prisma.seller.findUnique.mockResolvedValue({ id: 'seller-1' });
      prisma.savedSeller.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.add('user-1', 'seller-1'),
      ).resolves.toBeUndefined();
    });

    it('creates the saved-seller row for a valid seller', async () => {
      prisma.seller.findUnique.mockResolvedValue({ id: 'seller-1' });
      prisma.savedSeller.create.mockResolvedValue({ id: 'ss-1' });

      await service.add('user-1', 'seller-1');

      expect(prisma.savedSeller.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', sellerId: 'seller-1' },
      });
    });
  });

  describe('remove', () => {
    it('is idempotent regardless of whether the seller was saved', async () => {
      prisma.savedSeller.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.remove('user-1', 'seller-1'),
      ).resolves.toBeUndefined();
      expect(prisma.savedSeller.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', sellerId: 'seller-1' },
      });
    });
  });

  describe('list', () => {
    it('flags a saved seller unavailable once suspended or without a storefront', async () => {
      prisma.savedSeller.findMany.mockResolvedValue([
        {
          id: 'ss-1',
          sellerId: 'seller-1',
          seller: {
            storefrontSlug: 'seller-one',
            displayName: 'Seller One',
            description: null,
            status: SellerStatus.APPROVED,
            ratingSummary: {
              ratingCount: 10,
              ratingSum: 45,
              star1Count: 0,
              star2Count: 0,
              star3Count: 0,
              star4Count: 0,
              star5Count: 10,
            },
          },
        },
        {
          id: 'ss-2',
          sellerId: 'seller-2',
          seller: {
            storefrontSlug: null,
            displayName: 'Seller Two',
            description: null,
            status: SellerStatus.SUSPENDED,
            ratingSummary: null,
          },
        },
      ]);

      const items = await service.list('user-1');

      expect(items[0]).toMatchObject({ isAvailable: true, averageRating: 4.5 });
      expect(items[1]).toMatchObject({
        isAvailable: false,
        ratingCount: 0,
      });
    });
  });
});
