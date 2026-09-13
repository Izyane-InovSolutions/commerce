import {
  OfferReadService,
  type CommerceOffer,
} from '../offers/offer-read.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CartStatus,
  OfferStockSource,
  ProductStatus,
  SellerStatus,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CartService } from './cart.service';

function buildPrisma(): {
  offer: { findUnique: jest.Mock };
  cart: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  cartItem: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
} {
  const prisma = {
    offer: { findUnique: jest.fn() },
    cart: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cartItem: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => unknown) => callback(prisma),
  );
  return prisma;
}

function buildOffer(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'offer-1',
    variantId: 'variant-1',
    status: ProductStatus.PUBLISHED,
    prices: [
      {
        id: 'price-1',
        amount: 1000,
        currency: 'USD',
        startsAt: new Date(Date.now() - 1000),
        endsAt: null,
      },
    ],
    ...overrides,
  };
}

describe('CartService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let inventoryService: {
    getAvailableQuantities: jest.Mock;
    getAvailableOfferQuantities: jest.Mock;
  };
  let service: CartService;

  beforeEach(() => {
    prisma = buildPrisma();
    inventoryService = {
      getAvailableQuantities: jest
        .fn()
        .mockImplementation((ids: string[]) =>
          Promise.resolve(new Map(ids.map((id) => [id, 10]))),
        ),
      getAvailableOfferQuantities: jest
        .fn()
        .mockImplementation((ids: string[]) =>
          Promise.resolve(new Map(ids.map((id) => [id, 10]))),
        ),
    };
    service = new CartService(
      prisma as unknown as PrismaService,
      inventoryService as unknown as InventoryService,
      {
        find: prisma.offer.findUnique,
        findMany: jest.fn().mockImplementation(() =>
          (
            prisma.cart.findUnique.mock.results.at(-1)?.value as Promise<{
              items: Array<{ offerId: string; offer: CommerceOffer }>;
            }>
          ).then((result) =>
            result.items.map((item) => ({ ...item.offer, id: item.offerId })),
          ),
        ),
      } as unknown as OfferReadService,
    );
  });

  describe('addItem', () => {
    it('allows adding a SELLER-stockSource offer from an approved seller', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        buildOffer({
          sellerId: 'seller-1',
          stockSource: OfferStockSource.SELLER,
          seller: { id: 'seller-1', status: SellerStatus.APPROVED },
        }),
      );
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });
      prisma.cart.findUnique.mockResolvedValue({ id: 'cart-1', items: [] });

      await expect(
        service.addItem({ userId: 'user-1' }, 'offer-1', 1, 'USD'),
      ).resolves.toBeDefined();

      expect(prisma.cartItem.upsert).toHaveBeenCalled();
    });

    it('rejects adding an offer from a suspended seller', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        buildOffer({
          sellerId: 'seller-1',
          seller: { id: 'seller-1', status: SellerStatus.SUSPENDED },
        }),
      );

      await expect(
        service.addItem({}, 'offer-1', 1, 'USD'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });

    it('rejects a non-positive quantity', async () => {
      await expect(
        service.addItem({}, 'offer-1', 0, 'USD'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects adding an offer that is not published', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        buildOffer({ status: ProductStatus.DRAFT }),
      );

      await expect(
        service.addItem({}, 'offer-1', 1, 'USD'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a guest cart and returns its token when the guest has no cart yet', async () => {
      // identity = {} (a brand-new guest with no token yet), so findCart()
      // short-circuits without touching the DB — the only findUnique call is
      // buildView's re-fetch after the cart is created.
      prisma.offer.findUnique.mockResolvedValue(buildOffer());
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        userId: null,
        guestToken: 'guest-token',
        items: [
          {
            id: 'item-1',
            offerId: 'offer-1',
            quantity: 1,
            offer: buildOffer(),
          },
        ],
      });
      prisma.cart.create.mockResolvedValue({
        id: 'cart-1',
        guestToken: 'guest-token',
      });

      const result = await service.addItem({}, 'offer-1', 1, 'USD');

      expect(prisma.cart.create).toHaveBeenCalledWith({
        data: { guestToken: expect.any(String) as string },
      });
      expect(result.guestToken).toEqual(expect.any(String));
      expect(result.view.items).toHaveLength(1);
    });

    it('increments quantity instead of duplicating a line for the same offer', async () => {
      prisma.offer.findUnique.mockResolvedValue(buildOffer());
      prisma.cart.findFirst.mockResolvedValue({
        id: 'cart-1',
        userId: 'user-1',
      });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            id: 'item-1',
            offerId: 'offer-1',
            quantity: 2,
            offer: buildOffer(),
          },
        ],
      });

      await service.addItem({ userId: 'user-1' }, 'offer-1', 3, 'USD');

      expect(prisma.cartItem.upsert).toHaveBeenCalledWith({
        where: { cartId_offerId: { cartId: 'cart-1', offerId: 'offer-1' } },
        create: { cartId: 'cart-1', offerId: 'offer-1', quantity: 3 },
        update: { quantity: { increment: 3 } },
      });
    });
  });

  describe('buildView (via getCartView)', () => {
    it('returns an empty view without creating a cart when none exists', async () => {
      prisma.cart.findFirst.mockResolvedValue(null);

      const view = await service.getCartView({ userId: 'user-1' }, 'USD');

      // An empty cart still reports the currency it was asked for, so a
      // storefront knows what it is displaying before anything is in it.
      expect(view).toEqual({
        id: null,
        items: [],
        subtotal: 0,
        currency: 'USD',
      });
      expect(prisma.cart.create).not.toHaveBeenCalled();
    });

    it('flags a line unavailable when stock is insufficient, without removing it', async () => {
      inventoryService.getAvailableQuantities.mockImplementation(
        (ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, 1]))),
      );
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            id: 'item-1',
            offerId: 'offer-1',
            quantity: 5,
            offer: buildOffer(),
          },
        ],
      });

      const view = await service.getCartView({ userId: 'user-1' }, 'USD');

      expect(view.items).toHaveLength(1);
      expect(view.items[0]).toMatchObject({ isAvailable: false, lineTotal: 0 });
      expect(view.subtotal).toBe(0);
    });

    it('flags a line unavailable when the offer has no current price', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            id: 'item-1',
            offerId: 'offer-1',
            quantity: 1,
            offer: buildOffer({ prices: [] }),
          },
        ],
      });

      const view = await service.getCartView({ userId: 'user-1' }, 'USD');

      expect(view.items[0]).toMatchObject({
        isAvailable: false,
        unitPrice: null,
      });
    });

    it('sums only available lines into the subtotal', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            id: 'item-1',
            offerId: 'offer-1',
            quantity: 2,
            offer: buildOffer(),
          },
          {
            id: 'item-2',
            offerId: 'offer-2',
            quantity: 1,
            offer: buildOffer({ id: 'offer-2', prices: [] }),
          },
        ],
      });

      const view = await service.getCartView({ userId: 'user-1' }, 'USD');

      expect(view.subtotal).toBe(2000);
      expect(view.currency).toBe('USD');
    });

    it('uses offer-scoped inventory for a SELLER-stockSource line', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            id: 'item-1',
            offerId: 'offer-1',
            quantity: 2,
            offer: buildOffer({
              sellerId: 'seller-1',
              stockSource: OfferStockSource.SELLER,
              seller: { id: 'seller-1', status: SellerStatus.APPROVED },
            }),
          },
        ],
      });

      const view = await service.getCartView({ userId: 'user-1' }, 'USD');

      expect(view.items[0]).toMatchObject({
        isAvailable: true,
        sellerId: 'seller-1',
      });
      expect(inventoryService.getAvailableQuantities).toHaveBeenCalledWith([]);
      expect(inventoryService.getAvailableOfferQuantities).toHaveBeenCalledWith(
        ['offer-1'],
      );
    });

    it('marks a line from a now-suspended seller unavailable', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            id: 'item-1',
            offerId: 'offer-1',
            quantity: 1,
            offer: buildOffer({
              sellerId: 'seller-1',
              stockSource: OfferStockSource.SELLER,
              seller: { id: 'seller-1', status: SellerStatus.SUSPENDED },
            }),
          },
        ],
      });

      const view = await service.getCartView({ userId: 'user-1' }, 'USD');

      expect(view.items[0]).toMatchObject({ isAvailable: false });
    });
  });

  describe('updateItemQuantity / removeItem', () => {
    it('throws not found when the cart does not exist', async () => {
      prisma.cart.findFirst.mockResolvedValue(null);

      await expect(
        service.updateItemQuantity({ userId: 'user-1' }, 'item-1', 2, 'USD'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws not found when the item does not belong to the resolved cart', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });
      prisma.cartItem.findUnique.mockResolvedValue({
        id: 'item-1',
        cartId: 'someone-elses-cart',
      });

      await expect(
        service.removeItem({ userId: 'user-1' }, 'item-1', 'USD'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('mergeGuestCart', () => {
    it('is a no-op when no guest token is provided', async () => {
      prisma.cart.findFirst.mockResolvedValue(null);

      await service.mergeGuestCart('user-1', undefined, 'USD');

      expect(prisma.cart.findUnique).not.toHaveBeenCalled();
    });

    it('upserts guest lines into the user cart and marks the guest cart MERGED', async () => {
      prisma.cart.findUnique
        .mockResolvedValueOnce({
          id: 'guest-cart',
          status: CartStatus.ACTIVE,
          items: [{ id: 'gi-1', offerId: 'offer-1', quantity: 2 }],
        })
        .mockResolvedValue({ id: 'user-cart', items: [] });
      prisma.cart.findFirst.mockResolvedValue({
        id: 'user-cart',
        userId: 'user-1',
      });

      await service.mergeGuestCart('user-1', 'guest-token', 'USD');

      expect(prisma.cartItem.upsert).toHaveBeenCalledWith({
        where: { cartId_offerId: { cartId: 'user-cart', offerId: 'offer-1' } },
        create: { cartId: 'user-cart', offerId: 'offer-1', quantity: 2 },
        update: { quantity: { increment: 2 } },
      });
      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: 'guest-cart' },
        data: { status: CartStatus.MERGED },
      });
    });

    it('does nothing when the guest token does not resolve to an active cart', async () => {
      prisma.cart.findUnique.mockResolvedValueOnce(null);
      prisma.cart.findFirst.mockResolvedValue(null);

      await service.mergeGuestCart('user-1', 'unknown-token', 'USD');

      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });
  });

  describe('clearCart', () => {
    it('deletes every item on the resolved cart', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });

      await service.clearCart({ userId: 'user-1' });

      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId: 'cart-1' },
      });
    });

    it('is a no-op when no cart resolves', async () => {
      prisma.cart.findFirst.mockResolvedValue(null);

      await service.clearCart({ userId: 'user-1' });

      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
    });
  });
});
