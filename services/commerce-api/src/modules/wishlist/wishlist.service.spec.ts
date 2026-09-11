import { OfferReadService, type CommerceOffer } from '../offers/offer-read.service';
import { BadRequestException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { WishlistService } from './wishlist.service';

function buildPrisma(): {
  offer: { findUnique: jest.Mock };
  wishlistItem: {
    findMany: jest.Mock;
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
} {
  return {
    offer: { findUnique: jest.fn() },
    wishlistItem: {
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

describe('WishlistService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let inventoryService: { getAvailableQuantities: jest.Mock };
  let service: WishlistService;

  beforeEach(() => {
    prisma = buildPrisma();
    inventoryService = {
      getAvailableQuantities: jest
        .fn()
        .mockImplementation((ids: string[]) =>
          Promise.resolve(new Map(ids.map((id) => [id, 5]))),
        ),
    };
    service = new WishlistService(
      prisma as unknown as PrismaService,
      inventoryService as unknown as InventoryService,
      {find: prisma.offer.findUnique, findMany: jest.fn().mockImplementation(() =>
        (prisma.wishlistItem.findMany.mock.results.at(-1)?.value as Promise<Array<{offerId:string;offer:CommerceOffer}>>).then(result=>result.map(item=>({...item.offer,id:item.offerId})))
      )} as unknown as OfferReadService,
    );
  });

  describe('add', () => {
    it('rejects adding an offer that does not exist', async () => {
      prisma.offer.findUnique.mockResolvedValue(null);

      await expect(
        service.add('user-1', 'missing-offer'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('is idempotent when the item is already on the wishlist', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 'offer-1' });
      prisma.wishlistItem.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.add('user-1', 'offer-1')).resolves.toBeUndefined();
    });

    it('creates the wishlist row for a valid offer', async () => {
      prisma.offer.findUnique.mockResolvedValue({ id: 'offer-1' });
      prisma.wishlistItem.create.mockResolvedValue({ id: 'wi-1' });

      await service.add('user-1', 'offer-1');

      expect(prisma.wishlistItem.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', offerId: 'offer-1' },
      });
    });
  });

  describe('remove', () => {
    it('is idempotent regardless of whether the item existed', async () => {
      prisma.wishlistItem.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.remove('user-1', 'offer-1'),
      ).resolves.toBeUndefined();
      expect(prisma.wishlistItem.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', offerId: 'offer-1' },
      });
    });
  });

  describe('list', () => {
    it('flags items unavailable when out of stock or no current price', async () => {
      inventoryService.getAvailableQuantities.mockResolvedValue(
        new Map([
          ['v1', 0],
          ['v2', 5],
        ]),
      );
      prisma.wishlistItem.findMany.mockResolvedValue([
        {
          id: 'wi-1',
          offerId: 'offer-1',
          offer: {
            variantId: 'v1',
            status: ProductStatus.PUBLISHED,
            prices: [
              {
                amount: 100,
                currency: 'USD',
                startsAt: new Date(0),
                endsAt: null,
              },
            ],
          },
        },
        {
          id: 'wi-2',
          offerId: 'offer-2',
          offer: {
            variantId: 'v2',
            status: ProductStatus.PUBLISHED,
            prices: [],
          },
        },
      ]);

      const items = await service.list('user-1');

      expect(items[0]).toMatchObject({ isAvailable: false });
      expect(items[1]).toMatchObject({
        isAvailable: false,
        currentPrice: null,
      });
    });
  });
});
