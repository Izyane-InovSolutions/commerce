import {
  OfferReadService,
  type CommerceOffer,
} from '../offers/offer-read.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  CartStatus,
  OfferStockSource,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ProductStatus,
  SellerStatus,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CartService } from './cart.service';

type OfferCarrier = { offerId: string; offer?: CommerceOffer };

function buildPrisma(): {
  offer: { findUnique: jest.Mock };
  order: { findFirst: jest.Mock };
  cart: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  cartItem: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
} {
  const prisma = {
    offer: { findUnique: jest.fn() },
    order: { findFirst: jest.fn() },
    cart: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cartItem: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
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

function lockedSql(prisma: ReturnType<typeof buildPrisma>): string[] {
  return prisma.$queryRaw.mock.calls.map(
    ([strings, ...values]: [TemplateStringsArray, ...unknown[]]) =>
      `${strings.join('?')} [${values.join(',')}]`,
  );
}

describe('CartService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let inventoryService: {
    getAvailableQuantities: jest.Mock;
    getAvailableOfferQuantities: jest.Mock;
    getAllocatableStock: jest.Mock;
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
      getAllocatableStock: jest.fn().mockImplementation(
        (
          pools: Array<{
            kind: string;
            variantId?: string;
            offerId?: string;
          }>,
        ) =>
          Promise.resolve(
            new Map(
              pools.map((pool) => [
                `${pool.kind}:${pool.variantId ?? pool.offerId}`,
                [10],
              ]),
            ),
          ),
      ),
    };
    // Offers resolve from whatever lines the test's cart reads returned last,
    // falling back to a plain published offer.
    const findOffers = async (ids: string[]): Promise<CommerceOffer[]> => {
      const known = new Map<string, CommerceOffer>();
      const cart = (await prisma.cart.findUnique.mock.results.at(-1)?.value) as
        | { items?: OfferCarrier[] }
        | null
        | undefined;
      const lines = (await prisma.cartItem.findMany.mock.results.at(-1)
        ?.value) as OfferCarrier[] | undefined;
      for (const item of [...(cart?.items ?? []), ...(lines ?? [])]) {
        if (item.offer) known.set(item.offerId, item.offer);
      }
      return ids.map(
        (id) =>
          ({
            ...(known.get(id) ?? buildOffer()),
            id,
          }) as unknown as CommerceOffer,
      );
    };
    service = new CartService(
      prisma as unknown as PrismaService,
      inventoryService as unknown as InventoryService,
      {
        find: prisma.offer.findUnique,
        findMany: jest.fn().mockImplementation(findOffers),
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
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.ACTIVE,
        items: [],
      });

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
      // short-circuits without touching the DB.
      prisma.offer.findUnique.mockResolvedValue(buildOffer());
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        userId: null,
        guestToken: 'guest-token',
        status: CartStatus.ACTIVE,
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

    it('creates a user cart under the users row lock', async () => {
      prisma.offer.findUnique.mockResolvedValue(buildOffer());
      prisma.cart.findFirst.mockResolvedValue(null);
      prisma.cart.findUnique.mockResolvedValueOnce(null).mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.ACTIVE,
        items: [],
      });
      prisma.cart.create.mockResolvedValue({ id: 'cart-1', userId: 'user-1' });

      await service.addItem({ userId: 'user-1' }, 'offer-1', 1, 'USD');

      expect(lockedSql(prisma)[0]).toMatch(
        /FROM users .*FOR UPDATE \[user-1\]/,
      );
      expect(prisma.cart.create).toHaveBeenCalledWith({
        data: { userId: 'user-1' },
      });
    });

    it('rereads the user cart when a concurrent creation wins the unique index', async () => {
      prisma.offer.findUnique.mockResolvedValue(buildOffer());
      prisma.cart.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementationOnce(() =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        ),
      );
      prisma.cart.findUniqueOrThrow.mockResolvedValue({
        id: 'cart-1',
        userId: 'user-1',
      });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.ACTIVE,
        items: [],
      });

      await service.addItem({ userId: 'user-1' }, 'offer-1', 1, 'USD');

      expect(prisma.cart.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.cartItem.upsert).toHaveBeenCalled();
    });

    it('sets the summed quantity and bumps the revision of an existing line', async () => {
      prisma.offer.findUnique.mockResolvedValue(buildOffer());
      prisma.cart.findFirst.mockResolvedValue({
        id: 'cart-1',
        userId: 'user-1',
      });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.ACTIVE,
        items: [],
      });
      prisma.cartItem.findUnique.mockResolvedValue({
        id: 'item-1',
        offerId: 'offer-1',
        quantity: 2,
      });

      await service.addItem({ userId: 'user-1' }, 'offer-1', 3, 'USD');

      expect(lockedSql(prisma)).toEqual([
        expect.stringMatching(/FROM carts .*FOR UPDATE \[cart-1\]/),
      ]);
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith({
        where: { cartId_offerId: { cartId: 'cart-1', offerId: 'offer-1' } },
        create: { cartId: 'cart-1', offerId: 'offer-1', quantity: 3 },
        update: { quantity: 5, revision: { increment: 1 } },
      });
    });

    it('rejects with 409 when the resulting line exceeds allocatable stock', async () => {
      prisma.offer.findUnique.mockResolvedValue(buildOffer());
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.ACTIVE,
        items: [],
      });
      prisma.cartItem.findMany.mockResolvedValue([
        { id: 'item-1', offerId: 'offer-1', quantity: 6 },
      ]);
      // Two warehouses with 4 and 5: 9 in total, but no single record holds 6.
      inventoryService.getAllocatableStock.mockResolvedValue(
        new Map([['variant:variant-1', [4, 5]]]),
      );

      const error = (await service
        .addItem({ userId: 'user-1' }, 'offer-1', 6, 'USD')
        .catch((caught: unknown) => caught)) as ConflictException;

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual({
        message: 'Requested quantity exceeds available stock',
        details: [
          { field: 'offerId', message: 'offer-1' },
          { field: 'available', message: '9' },
        ],
      });
      expect(inventoryService.getAllocatableStock).toHaveBeenCalledWith(
        [{ kind: 'variant', variantId: 'variant-1' }],
        prisma,
      );
    });

    it('rejects a quantity that would overflow the column before writing', async () => {
      prisma.offer.findUnique.mockResolvedValue(buildOffer());
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.ACTIVE,
      });
      prisma.cartItem.findUnique.mockResolvedValue({
        id: 'item-1',
        offerId: 'offer-1',
        quantity: 2_147_483_647,
      });

      await expect(
        service.addItem({ userId: 'user-1' }, 'offer-1', 1, 'USD'),
      ).rejects.toThrow('Cart quantity is too large');
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });

    it('rejects with 409 when the cart stopped being active under the lock', async () => {
      prisma.offer.findUnique.mockResolvedValue(buildOffer());
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.MERGED,
      });

      await expect(
        service.addItem({ guestToken: 'guest' }, 'offer-1', 1, 'USD'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
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

  describe('previewOfferLine', () => {
    it('rejects a non-positive quantity without reading the offer', async () => {
      await expect(
        service.previewOfferLine('offer-1', 0, 'USD'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.offer.findUnique).not.toHaveBeenCalled();
    });

    it('prices and checks a single offer without touching any cart', async () => {
      prisma.offer.findUnique.mockResolvedValue(buildOffer());

      const line = await service.previewOfferLine('offer-1', 3, 'USD');

      expect(line).toMatchObject({
        offerId: 'offer-1',
        quantity: 3,
        isAvailable: true,
        lineTotal: 3000,
      });
      expect(prisma.cart.findFirst).not.toHaveBeenCalled();
      expect(prisma.cart.findUnique).not.toHaveBeenCalled();
    });

    it('flags the line unavailable when stock is insufficient', async () => {
      prisma.offer.findUnique.mockResolvedValue(buildOffer());
      inventoryService.getAvailableQuantities.mockResolvedValue(
        new Map([['variant-1', 1]]),
      );

      const line = await service.previewOfferLine('offer-1', 5, 'USD');

      expect(line).toMatchObject({ isAvailable: false, lineTotal: 0 });
    });
  });

  describe('updateItemQuantity / removeItem', () => {
    beforeEach(() => {
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.ACTIVE,
        items: [],
      });
    });

    it('throws not found when the cart does not exist', async () => {
      prisma.cart.findFirst.mockResolvedValue(null);

      await expect(
        service.updateItemQuantity({ userId: 'user-1' }, 'item-1', 2, 'USD'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws not found when the item does not belong to the resolved cart', async () => {
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.removeItem({ userId: 'user-1' }, 'item-1', 'USD'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { id: 'item-1', cartId: 'cart-1' },
      });
    });

    it('throws not found when updating a line outside the resolved cart', async () => {
      prisma.cartItem.findFirst.mockResolvedValue(null);

      await expect(
        service.updateItemQuantity({ userId: 'user-1' }, 'item-1', 2, 'USD'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });

    it('bumps the revision even when the quantity is unchanged, without a stock check', async () => {
      prisma.cartItem.findFirst.mockResolvedValue({
        id: 'item-1',
        offerId: 'offer-1',
        quantity: 2,
      });

      await service.updateItemQuantity(
        { userId: 'user-1' },
        'item-1',
        2,
        'USD',
      );

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { quantity: 2, revision: { increment: 1 } },
      });
      expect(inventoryService.getAllocatableStock).not.toHaveBeenCalled();
    });

    it('lets a decrease through even when the pool is already short', async () => {
      prisma.cartItem.findFirst.mockResolvedValue({
        id: 'item-1',
        offerId: 'offer-1',
        quantity: 8,
      });
      inventoryService.getAllocatableStock.mockResolvedValue(
        new Map([['variant:variant-1', [1]]]),
      );

      await service.updateItemQuantity(
        { userId: 'user-1' },
        'item-1',
        5,
        'USD',
      );

      expect(prisma.cartItem.update).toHaveBeenCalled();
      expect(inventoryService.getAllocatableStock).not.toHaveBeenCalled();
    });

    it('stock-checks an increase', async () => {
      prisma.cartItem.findFirst.mockResolvedValue({
        id: 'item-1',
        offerId: 'offer-1',
        quantity: 1,
      });
      prisma.cartItem.findMany.mockResolvedValue([
        { id: 'item-1', offerId: 'offer-1', quantity: 4 },
      ]);
      inventoryService.getAllocatableStock.mockResolvedValue(
        new Map([['variant:variant-1', [3]]]),
      );

      await expect(
        service.updateItemQuantity({ userId: 'user-1' }, 'item-1', 4, 'USD'),
      ).rejects.toThrow('Requested quantity exceeds available stock');
    });

    it('rejects a quantity larger than the column holds', async () => {
      prisma.cartItem.findFirst.mockResolvedValue({
        id: 'item-1',
        offerId: 'offer-1',
        quantity: 1,
      });

      await expect(
        service.updateItemQuantity(
          { userId: 'user-1' },
          'item-1',
          2_147_483_648,
          'USD',
        ),
      ).rejects.toThrow('Cart quantity is too large');
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });
  });

  describe('mergeGuestCart', () => {
    it('is a no-op when no guest token is provided', async () => {
      prisma.cart.findFirst.mockResolvedValue(null);

      await service.mergeGuestCart('user-1', undefined, 'USD');

      expect(prisma.cart.findUnique).not.toHaveBeenCalled();
    });

    it('locks both carts in id order, merges with revisions and marks the guest cart MERGED', async () => {
      prisma.cart.findUnique
        // Unlocked guest lookup, locked guest reread, locked user reread.
        .mockResolvedValueOnce({ id: 'b-guest', status: CartStatus.ACTIVE })
        .mockResolvedValueOnce({
          id: 'b-guest',
          status: CartStatus.ACTIVE,
          items: [
            { id: 'gi-1', offerId: 'offer-1', quantity: 2 },
            { id: 'gi-2', offerId: 'offer-2', quantity: 1 },
          ],
        })
        .mockResolvedValueOnce({
          id: 'a-user',
          status: CartStatus.ACTIVE,
          items: [{ id: 'ui-1', offerId: 'offer-1', quantity: 3 }],
        })
        .mockResolvedValue({ id: 'a-user', items: [] });
      prisma.cart.findFirst.mockResolvedValue({
        id: 'a-user',
        userId: 'user-1',
      });

      await service.mergeGuestCart('user-1', 'guest-token', 'USD');

      expect(lockedSql(prisma)).toEqual([
        expect.stringMatching(/FROM carts .*\[a-user\]/),
        expect.stringMatching(/FROM carts .*\[b-guest\]/),
      ]);
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith({
        where: { cartId_offerId: { cartId: 'a-user', offerId: 'offer-1' } },
        create: { cartId: 'a-user', offerId: 'offer-1', quantity: 5 },
        update: { quantity: 5, revision: { increment: 1 } },
      });
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith({
        where: { cartId_offerId: { cartId: 'a-user', offerId: 'offer-2' } },
        create: { cartId: 'a-user', offerId: 'offer-2', quantity: 1 },
        update: { quantity: 1, revision: { increment: 1 } },
      });
      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: 'b-guest' },
        data: { status: CartStatus.MERGED },
      });
    });

    it('does nothing when the guest cart was merged concurrently', async () => {
      prisma.cart.findUnique
        .mockResolvedValueOnce({ id: 'guest-cart', status: CartStatus.ACTIVE })
        .mockResolvedValueOnce({
          id: 'guest-cart',
          status: CartStatus.MERGED,
          items: [{ id: 'gi-1', offerId: 'offer-1', quantity: 2 }],
        })
        .mockResolvedValue({ id: 'user-cart', items: [] });
      prisma.cart.findFirst.mockResolvedValue({ id: 'user-cart' });

      await service.mergeGuestCart('user-1', 'guest-token', 'USD');

      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
      expect(prisma.cart.update).not.toHaveBeenCalled();
    });

    it('rejects the whole merge with 409 on a stock shortage', async () => {
      prisma.cart.findUnique
        .mockResolvedValueOnce({ id: 'guest-cart', status: CartStatus.ACTIVE })
        .mockResolvedValueOnce({
          id: 'guest-cart',
          status: CartStatus.ACTIVE,
          items: [{ id: 'gi-1', offerId: 'offer-1', quantity: 4 }],
        })
        .mockResolvedValueOnce({
          id: 'user-cart',
          status: CartStatus.ACTIVE,
          items: [],
        });
      prisma.cart.findFirst.mockResolvedValue({ id: 'user-cart' });
      prisma.cartItem.findMany.mockResolvedValue([
        { id: 'ui-1', offerId: 'offer-1', quantity: 4 },
      ]);
      inventoryService.getAllocatableStock.mockResolvedValue(
        new Map([['variant:variant-1', [3]]]),
      );

      await expect(
        service.mergeGuestCart('user-1', 'guest-token', 'USD'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does nothing when the guest token does not resolve to an active cart', async () => {
      prisma.cart.findUnique.mockResolvedValueOnce(null);
      prisma.cart.findFirst.mockResolvedValue(null);

      await service.mergeGuestCart('user-1', 'unknown-token', 'USD');

      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });
  });

  describe('checkout snapshot', () => {
    it('reads only the named lines of the active user cart', async () => {
      prisma.cartItem.findMany.mockResolvedValue([]);

      await service.getCheckoutSnapshot('user-1', ['item-1']);

      expect(prisma.cartItem.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['item-1'] },
          cart: { userId: 'user-1', status: CartStatus.ACTIVE },
        },
        select: {
          id: true,
          offerId: true,
          quantity: true,
          revision: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    });

    const snapshot = [
      { id: 'item-1', offerId: 'offer-1', quantity: 2, revision: 3 },
    ];

    it('locks the cart and accepts an unchanged snapshot', async () => {
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.ACTIVE,
      });
      prisma.cartItem.findMany.mockResolvedValue(snapshot);

      await expect(
        service.lockAndVerifyCheckoutSnapshot(
          prisma as unknown as Prisma.TransactionClient,
          'user-1',
          snapshot,
        ),
      ).resolves.toBeUndefined();
      expect(lockedSql(prisma)).toEqual([
        expect.stringMatching(/FROM carts .*FOR UPDATE \[cart-1\]/),
      ]);
    });

    it.each([
      ['a changed revision', [{ ...snapshot[0], revision: 4 }]],
      ['a changed quantity', [{ ...snapshot[0], quantity: 1 }]],
      ['a missing line', []],
    ])('rejects %s', async (_label, rows) => {
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.ACTIVE,
      });
      prisma.cartItem.findMany.mockResolvedValue(rows);

      await expect(
        service.lockAndVerifyCheckoutSnapshot(
          prisma as unknown as Prisma.TransactionClient,
          'user-1',
          snapshot,
        ),
      ).rejects.toThrow('Cart changed; review your cart and check out again');
    });
  });

  describe('cleanUpCheckout', () => {
    const receipt = [
      { id: 'item-1', offerId: 'offer-1', quantity: 2, revision: 3 },
    ];

    it('deletes only lines that still match the receipt', async () => {
      prisma.order.findFirst.mockResolvedValue({
        checkoutCartSnapshot: receipt,
        payment: { status: PaymentStatus.PENDING, providerReference: 'ref-1' },
      });
      prisma.cart.findUnique.mockResolvedValue({ id: 'cart-1' });

      await service.cleanUpCheckout('user-1', 'order-1');

      expect(lockedSql(prisma)).toEqual([
        expect.stringMatching(/FROM carts .*FOR UPDATE \[cart-1\]/),
      ]);
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: {
          cartId: 'cart-1',
          OR: [{ id: 'item-1', quantity: 2, revision: 3 }],
        },
      });
    });

    it('throws for a retry while no payment is recorded', async () => {
      prisma.order.findFirst.mockResolvedValue({
        status: OrderStatus.PENDING_PAYMENT,
        checkoutCartSnapshot: receipt,
        payment: null,
      });

      await expect(
        service.cleanUpCheckout('user-1', 'order-1'),
      ).rejects.toThrow();
      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it('throws for a retry while an unsubmitted payment awaits reconciliation', async () => {
      prisma.order.findFirst.mockResolvedValue({
        checkoutCartSnapshot: receipt,
        payment: { status: PaymentStatus.PENDING, providerReference: null },
      });

      await expect(
        service.cleanUpCheckout('user-1', 'order-1'),
      ).rejects.toThrow();
      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it.each([PaymentStatus.FAILED, PaymentStatus.CANCELLED])(
      'keeps the cart when the payment is %s',
      async (status) => {
        prisma.order.findFirst.mockResolvedValue({
          checkoutCartSnapshot: receipt,
          payment: { status, providerReference: 'ref-1' },
        });

        await service.cleanUpCheckout('user-1', 'order-1');

        expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
      },
    );

    it('deletes nothing for a legacy order without a receipt', async () => {
      prisma.order.findFirst.mockResolvedValue({
        checkoutCartSnapshot: null,
        payment: { status: PaymentStatus.SUCCEEDED, providerReference: null },
      });

      await service.cleanUpCheckout('user-1', 'order-1');

      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('clearCart', () => {
    it('deletes every item on the resolved cart', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.ACTIVE,
      });

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

  describe('removeItems', () => {
    it('deletes only the named items on the resolved cart', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: 'cart-1' });
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        status: CartStatus.ACTIVE,
      });

      await service.removeItems({ userId: 'user-1' }, ['item-1', 'item-2']);

      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId: 'cart-1', id: { in: ['item-1', 'item-2'] } },
      });
    });

    it('is a no-op when no cart resolves', async () => {
      prisma.cart.findFirst.mockResolvedValue(null);

      await service.removeItems({ userId: 'user-1' }, ['item-1']);

      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
    });
  });
});
