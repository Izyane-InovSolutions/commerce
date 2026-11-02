import { OfferReadService } from '../offers/offer-read.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';

import { AddressesService } from '../users/addresses/addresses.service';
import { CartService } from '../cart/cart.service';
import { CART_CLEANUP_JOB_TYPE } from '../cart/jobs/cart-cleanup.handler';
import {
  CHECKOUT_ATTEMPT_LEASE_MS,
  CheckoutAttemptSupersededError,
} from '../checkout/checkout-attempt.errors';
import { LedgerService } from '../financials/ledger.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../../database/prisma.service';
import { BackgroundJobsService } from '../../infrastructure/jobs/background-jobs.service';
import { OutboxService } from '../../infrastructure/jobs/outbox.service';
import { ShippingService } from '../shipping/shipping.service';
import {
  UNPAID_ORDER_EXPIRY_JOB_TYPE,
  UNPAID_ORDER_EXPIRY_MAX_ATTEMPTS,
} from './jobs/unpaid-order-expiry.job';
import { ORDER_OMIT, OrdersService } from './orders.service';

function buildPrisma(): {
  offer: { findMany: jest.Mock };
  order: {
    create: jest.Mock;
    update: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  orderItem: { update: jest.Mock; findUnique: jest.Mock };
  checkoutAttempt: { updateMany: jest.Mock };
  fulfillmentOrder: { findMany: jest.Mock };
  sellerOrder: {
    create: jest.Mock;
    updateMany: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  shippingGroup: { create: jest.Mock };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
} {
  let sellerOrderSequence = 0;
  let orderItemSequence = 0;
  const prisma = {
    offer: { findMany: jest.fn() },
    order: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      // confirmPayment's separate read of the persisted cart snapshot.
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ checkoutCartSnapshot: null }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    checkoutAttempt: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    orderItem: { update: jest.fn(), findUnique: jest.fn() },
    fulfillmentOrder: { findMany: jest.fn().mockResolvedValue([]) },
    sellerOrder: {
      create: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ id: `seller-order-${++sellerOrderSequence}` }),
        ),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest
        .fn()
        .mockResolvedValue([{ status: OrderStatus.PARTIALLY_REFUNDED }]),
      update: jest.fn(),
    },
    shippingGroup: {
      // Mirrors Prisma: the nested `items.create` entries come back with a
      // freshly generated id apiece, distinct from the cart line id they
      // were built from — reservations key off that id, not the cart line's.
      create: jest
        .fn()
        .mockImplementation(
          (args: {
            data: { items?: { create?: Array<Record<string, unknown>> } };
          }) => {
            const items = (args.data.items?.create ?? []).map((item) => ({
              id: `order-item-${++orderItemSequence}`,
              ...item,
            }));
            return Promise.resolve({ id: `shipping-group-1`, items });
          },
        ),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  // The callback form runs against the same mock (the tx); the array form
  // (listAll's batched reads) resolves each query.
  prisma.$transaction.mockImplementation(
    (callback: ((tx: typeof prisma) => unknown) | Promise<unknown>[]) =>
      Array.isArray(callback) ? Promise.all(callback) : callback(prisma),
  );
  return prisma;
}

/** The SQL text and bound values of each tagged-template `$queryRaw` call. */
function rawQueries(mock: jest.Mock): { sql: string; values: unknown[] }[] {
  return (mock.mock.calls as [TemplateStringsArray, ...unknown[]][]).map(
    ([strings, ...values]) => ({ sql: strings.join('?'), values }),
  );
}

function callOrder(mock: jest.Mock, index = 0): number {
  return mock.mock.invocationCallOrder[index] ?? Number.POSITIVE_INFINITY;
}

function uniqueViolation(
  target?: unknown,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    ...(target === undefined ? {} : { meta: { target } }),
  });
}

const FENCE = { id: 'attempt-1', ownerToken: 'owner-1' };

function cartLine(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'item-1',
    offerId: 'offer-1',
    sellerId: null,
    quantity: 2,
    unitPrice: { amount: 1000, currency: 'USD' },
    lineTotal: 2000,
    isAvailable: true,
    ...overrides,
  };
}

describe('OrdersService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let cartService: {
    getCartView: jest.Mock;
    clearCart: jest.Mock;
    previewOfferLine: jest.Mock;
    getCheckoutSnapshot: jest.Mock;
    lockAndVerifyCheckoutSnapshot: jest.Mock;
  };
  let inventoryService: {
    reserve: jest.Mock;
    reserveOffer: jest.Mock;
    commit: jest.Mock;
    release: jest.Mock;
    commitMany: jest.Mock;
    releaseMany: jest.Mock;
    restock: jest.Mock;
    lockOffersForKeyShare: jest.Mock;
    lockStockPools: jest.Mock;
  };
  let addressesService: { findOne: jest.Mock };
  let ledgerService: { recordSale: jest.Mock; ensureCurrency: jest.Mock };
  let shippingService: { quoteSellerGroups: jest.Mock };
  let backgroundJobs: { enqueue: jest.Mock };
  let service: OrdersService;

  const address = {
    label: null,
    recipientName: 'Jane',
    phone: null,
    line1: '1 Main St',
    line2: null,
    city: 'Metropolis',
    region: null,
    postalCode: '12345',
    country: 'US',
  };

  beforeEach(() => {
    prisma = buildPrisma();
    prisma.sellerOrder.findUniqueOrThrow.mockImplementation(
      (args: unknown) => prisma.sellerOrder.findUnique(args) as unknown,
    );
    cartService = {
      getCartView: jest.fn(),
      clearCart: jest.fn(),
      previewOfferLine: jest.fn(),
      // By default the persisted rows match the cart view just read, in
      // view order, each created a second after the previous one.
      getCheckoutSnapshot: jest.fn(async (_userId: string, ids: string[]) => {
        const view = (await cartService.getCartView.mock.results.at(-1)
          ?.value) as { items: Array<Record<string, unknown>> };
        return view.items
          .filter((item) => ids.includes(item.id as string))
          .map((item, index) => ({
            id: item.id,
            offerId: item.offerId,
            quantity: item.quantity,
            revision: 3,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
          }));
      }),
      lockAndVerifyCheckoutSnapshot: jest.fn().mockResolvedValue(undefined),
    };
    inventoryService = {
      reserve: jest.fn(),
      reserveOffer: jest.fn().mockResolvedValue({ id: 'seller-reservation' }),
      commit: jest.fn(),
      release: jest.fn(),
      commitMany: jest.fn().mockResolvedValue([]),
      releaseMany: jest.fn().mockResolvedValue([]),
      restock: jest.fn(),
      lockOffersForKeyShare: jest.fn().mockResolvedValue(undefined),
      lockStockPools: jest.fn().mockResolvedValue(['record-1']),
    };
    backgroundJobs = { enqueue: jest.fn().mockResolvedValue(undefined) };
    addressesService = { findOne: jest.fn().mockResolvedValue(address) };
    ledgerService = {
      recordSale: jest.fn().mockResolvedValue(undefined),
      ensureCurrency: jest.fn(),
    };
    shippingService = {
      quoteSellerGroups: jest.fn().mockImplementation(
        (
          _sellerId: string | null,
          items: Array<{
            fulfillmentMode: string;
            lineTotal: number;
          }>,
          _country: string,
          currency: string,
        ) => {
          const byMode = new Map<string, typeof items>();
          for (const item of items) {
            const held = byMode.get(item.fulfillmentMode) ?? [];
            held.push(item);
            byMode.set(item.fulfillmentMode, held);
          }
          return Promise.resolve(
            [...byMode].map(([fulfillmentMode, groupedItems]) => {
              const subtotal = groupedItems.reduce(
                (sum, item) => sum + item.lineTotal,
                0,
              );
              return {
                fulfillmentMode,
                serviceLevel: 'STANDARD',
                rateCode: 'FREE_STANDARD_V1',
                subtotal,
                shippingAmount: 0,
                total: subtotal,
                currency,
                items: groupedItems,
                quoteId: `quote-${fulfillmentMode}`,
                quoteExpiresAt: new Date(Date.now() + 60_000),
                estimatedDeliveryMinDays: 2,
                estimatedDeliveryMaxDays: 5,
              };
            }),
          );
        },
      ),
    };
    service = new OrdersService(
      prisma as unknown as PrismaService,
      cartService as unknown as CartService,
      inventoryService as unknown as InventoryService,
      addressesService as unknown as AddressesService,
      ledgerService as unknown as LedgerService,
      new OfferReadService(prisma as unknown as PrismaService),
      shippingService as unknown as ShippingService,
      backgroundJobs as unknown as BackgroundJobsService,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as OutboxService,
    );
  });

  describe('createFromCart', () => {
    it('rejects an empty cart', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [],
        subtotal: 0,
        currency: null,
      });

      await expect(
        service.createFromCart('user-1', 'addr-1', 'USD'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a cart with an unavailable line', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [cartLine({ isAvailable: false })],
        subtotal: 2000,
        currency: 'USD',
      });

      await expect(
        service.createFromCart('user-1', 'addr-1', 'USD'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a selection naming an item no longer in the cart', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [cartLine({ id: 'item-1' })],
        subtotal: 2000,
        currency: 'USD',
      });

      await expect(
        service.createFromCart('user-1', 'addr-1', 'USD', [
          'item-1',
          'item-missing',
        ]),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an empty selection', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [cartLine({ id: 'item-1' })],
        subtotal: 2000,
        currency: 'USD',
      });

      await expect(
        service.createFromCart('user-1', 'addr-1', 'USD', []),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('builds the order from only the selected lines, ignoring an unavailable line left unselected', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [
          cartLine({ id: 'item-1', offerId: 'offer-1' }),
          cartLine({ id: 'item-2', offerId: 'offer-2', isAvailable: false }),
        ],
        subtotal: 2000,
        currency: 'USD',
      });
      prisma.offer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          variantId: 'variant-1',
          sellerId: null,
          stockSource: 'PLATFORM',
        },
      ]);
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      inventoryService.reserve.mockResolvedValue({ id: 'reservation-1' });
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [
          {
            id: 'order-item-1',
            offerId: 'offer-1',
            quantity: 2,
            reservationId: 'reservation-1',
          },
        ],
        sellerOrders: [{ id: 'seller-order-1', sellerId: null, items: [] }],
      });

      const order = await service.createFromCart('user-1', 'addr-1', 'USD', [
        'item-1',
      ]);

      expect(prisma.offer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['offer-1'] } },
        }) as object,
      );
      expect(order.id).toBe('order-1');
    });

    it('creates the order, reserves stock per line, and returns it', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [cartLine()],
        subtotal: 2000,
        currency: 'USD',
      });
      prisma.offer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          variantId: 'variant-1',
          sellerId: null,
          stockSource: 'PLATFORM',
          fulfillmentMode: 'PLATFORM',
        },
      ]);
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      inventoryService.reserve.mockResolvedValue({ id: 'reservation-1' });
      shippingService.quoteSellerGroups.mockResolvedValueOnce([
        {
          fulfillmentMode: 'PLATFORM',
          serviceLevel: 'STANDARD',
          rateCode: 'PLATFORM_STANDARD',
          subtotal: 2000,
          shippingAmount: 300,
          total: 2300,
          currency: 'USD',
          items: [cartLine()],
          quoteId: 'quote-platform',
          quoteExpiresAt: new Date(Date.now() + 60_000),
          estimatedDeliveryMinDays: 2,
          estimatedDeliveryMaxDays: 5,
        },
      ]);
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [
          {
            id: 'item-1',
            offerId: 'offer-1',
            quantity: 2,
            reservationId: 'reservation-1',
          },
        ],
        sellerOrders: [
          {
            id: 'seller-order-1',
            sellerId: null,
            items: [{ id: 'item-1', offerId: 'offer-1', quantity: 2 }],
          },
        ],
      });

      const order = await service.createFromCart('user-1', 'addr-1', 'USD');

      expect(prisma.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subtotal: 2000,
          shippingAmount: 300,
          total: 2300,
        }) as unknown,
        select: { id: true },
      });
      expect(prisma.sellerOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subtotal: 2000,
          shippingAmount: 300,
          total: 2300,
        }) as unknown,
      });
      expect(prisma.shippingGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subtotal: 2000,
          shippingAmount: 300,
          total: 2300,
          rateCode: 'PLATFORM_STANDARD',
          quoteId: 'quote-platform',
          estimatedDeliveryMinDays: 2,
          estimatedDeliveryMaxDays: 5,
        }) as unknown,
        include: { items: true },
      });
      expect(inventoryService.reserve).toHaveBeenCalledWith(
        'variant-1',
        2,
        {
          holderType: 'order_item',
          holderId: 'order-item-1',
          lockedRecordIds: ['record-1'],
        },
        prisma,
      );
      expect(prisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'order-item-1' },
        data: { reservationId: 'reservation-1' },
      });
      expect(order.id).toBe('order-1');
      expect(order.sellerOrders).toHaveLength(1);
    });

    it('splits a cart spanning first-party and two sellers into one SellerOrder per group', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [
          cartLine({
            id: 'item-1',
            offerId: 'offer-1',
            sellerId: null,
            quantity: 1,
            lineTotal: 1000,
          }),
          cartLine({
            id: 'item-2',
            offerId: 'offer-2',
            sellerId: 'seller-a',
            quantity: 1,
            lineTotal: 1000,
          }),
          cartLine({
            id: 'item-3',
            offerId: 'offer-3',
            sellerId: 'seller-b',
            quantity: 1,
            lineTotal: 1000,
          }),
        ],
        subtotal: 3000,
        currency: 'USD',
      });
      prisma.offer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          variantId: 'variant-1',
          sellerId: null,
          stockSource: 'PLATFORM',
          fulfillmentMode: 'PLATFORM',
        },
        {
          id: 'offer-2',
          variantId: 'variant-2',
          sellerId: 'seller-a',
          stockSource: 'SELLER',
          fulfillmentMode: 'SELLER',
        },
        {
          id: 'offer-3',
          variantId: 'variant-3',
          sellerId: 'seller-b',
          stockSource: 'SELLER',
          fulfillmentMode: 'SELLER',
        },
      ]);
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      inventoryService.reserve.mockResolvedValue({ id: 'reservation-1' });
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [
          {
            id: 'item-1',
            offerId: 'offer-1',
            quantity: 1,
            reservationId: 'reservation-1',
          },
          {
            id: 'item-2',
            offerId: 'offer-2',
            quantity: 1,
            reservationId: null,
          },
          {
            id: 'item-3',
            offerId: 'offer-3',
            quantity: 1,
            reservationId: null,
          },
        ],
        sellerOrders: [
          { id: 'so-platform', sellerId: null, items: [] },
          { id: 'so-a', sellerId: 'seller-a', items: [] },
          { id: 'so-b', sellerId: 'seller-b', items: [] },
        ],
      });

      const order = await service.createFromCart('user-1', 'addr-1', 'USD');

      expect(prisma.sellerOrder.create).toHaveBeenCalledTimes(3);
      expect(inventoryService.reserve).toHaveBeenCalledTimes(1);
      expect(inventoryService.reserve).toHaveBeenCalledWith(
        'variant-1',
        1,
        {
          holderType: 'order_item',
          holderId: 'order-item-1',
          lockedRecordIds: ['record-1'],
        },
        prisma,
      );
      expect(inventoryService.reserveOffer).toHaveBeenCalledTimes(2);
      expect(inventoryService.reserveOffer).toHaveBeenCalledWith(
        'offer-2',
        1,
        {
          holderType: 'order_item',
          holderId: 'order-item-2',
          lockedRecordIds: ['record-1'],
        },
        prisma,
      );
      expect(order.sellerOrders).toHaveLength(3);
    });

    it('rolls back atomically, with no separate compensation step, when a later reservation fails', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [
          cartLine({ id: 'item-1', offerId: 'offer-1' }),
          cartLine({ id: 'item-2', offerId: 'offer-2' }),
        ],
        subtotal: 4000,
        currency: 'USD',
      });
      prisma.offer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          variantId: 'variant-1',
          sellerId: null,
          stockSource: 'PLATFORM',
          fulfillmentMode: 'PLATFORM',
        },
        {
          id: 'offer-2',
          variantId: 'variant-2',
          sellerId: null,
          stockSource: 'PLATFORM',
          fulfillmentMode: 'PLATFORM',
        },
      ]);
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      inventoryService.reserve
        .mockResolvedValueOnce({ id: 'reservation-1' })
        .mockRejectedValueOnce(
          new ConflictException('Insufficient available stock'),
        );

      await expect(
        service.createFromCart('user-1', 'addr-1', 'USD'),
      ).rejects.toBeInstanceOf(ConflictException);

      // Reserving the first item and creating the order happen in the same
      // transaction as the second item's failed reservation, so the database
      // rolls all of it back together — OrdersService has nothing left to
      // undo by hand.
      expect(inventoryService.release).not.toHaveBeenCalled();
      expect(inventoryService.releaseMany).not.toHaveBeenCalled();
      expect(prisma.sellerOrder.updateMany).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
      // Nothing escaped the transaction: no cleanup job outside it, no read.
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('createFromOffer', () => {
    it('rejects an offer previewOfferLine reports unavailable', async () => {
      cartService.previewOfferLine.mockResolvedValue(
        cartLine({ isAvailable: false }),
      );

      await expect(
        service.createFromOffer('user-1', 'offer-1', 2, 'addr-1', 'USD'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a single-line order without ever reading the cart', async () => {
      cartService.previewOfferLine.mockResolvedValue(cartLine());
      prisma.offer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          variantId: 'variant-1',
          sellerId: null,
          stockSource: 'PLATFORM',
        },
      ]);
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      inventoryService.reserve.mockResolvedValue({ id: 'reservation-1' });
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [
          {
            id: 'item-1',
            offerId: 'offer-1',
            quantity: 2,
            reservationId: 'reservation-1',
          },
        ],
        sellerOrders: [
          {
            id: 'seller-order-1',
            sellerId: null,
            items: [{ id: 'item-1', offerId: 'offer-1', quantity: 2 }],
          },
        ],
      });

      const order = await service.createFromOffer(
        'user-1',
        'offer-1',
        2,
        'addr-1',
        'USD',
      );

      expect(cartService.previewOfferLine).toHaveBeenCalledWith(
        'offer-1',
        2,
        'USD',
      );
      expect(cartService.getCartView).not.toHaveBeenCalled();
      expect(inventoryService.reserve).toHaveBeenCalledWith(
        'variant-1',
        2,
        {
          holderType: 'order_item',
          holderId: 'order-item-1',
          lockedRecordIds: ['record-1'],
        },
        prisma,
      );
      expect(order.id).toBe('order-1');
    });
  });

  describe('the checkout order transaction', () => {
    const platformOffer = (
      id: string,
      variantId: string,
    ): {
      id: string;
      variantId: string;
      sellerId: string | null;
      stockSource: string;
      fulfillmentMode: string;
    } => ({
      id,
      variantId,
      sellerId: null,
      stockSource: 'PLATFORM',
      fulfillmentMode: 'PLATFORM',
    });

    /** A cart of `lines`, priced from the matching platform offers. */
    function cartOf(lines: Record<string, unknown>[]): void {
      cartService.getCartView.mockResolvedValue({
        items: lines,
        subtotal: 0,
        currency: 'USD',
      });
      prisma.offer.findMany.mockResolvedValue(
        lines.map((line) =>
          platformOffer(
            line.offerId as string,
            `variant-of-${line.offerId as string}`,
          ),
        ),
      );
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      inventoryService.reserve.mockImplementation(
        (
          _variantId: string,
          _quantity: number,
          options: { holderId: string },
        ) => Promise.resolve({ id: `reservation-for-${options.holderId}` }),
      );
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [],
        sellerOrders: [],
      });
    }

    it('persists a receipt of exactly the selected line versions, never their createdAt', async () => {
      cartOf([
        cartLine({ id: 'item-1', offerId: 'offer-1', quantity: 2 }),
        cartLine({ id: 'item-2', offerId: 'offer-2', quantity: 1 }),
      ]);

      await service.createFromCart(
        'user-1',
        'addr-1',
        'USD',
        ['item-2'],
        'key-1',
      );

      expect(cartService.getCheckoutSnapshot).toHaveBeenCalledWith('user-1', [
        'item-2',
      ]);
      const [{ data }] = prisma.order.create.mock.calls[0] as [
        {
          data: Record<string, unknown>;
        },
      ];
      expect(data.checkoutCartSnapshot).toEqual([
        { id: 'item-2', offerId: 'offer-2', quantity: 1, revision: 3 },
      ]);
      expect(data.idempotencyKey).toBe('key-1');
      expect(cartService.lockAndVerifyCheckoutSnapshot).toHaveBeenCalledWith(
        prisma,
        'user-1',
        [expect.objectContaining({ id: 'item-2', revision: 3 })],
      );
    });

    it('refuses a cart whose persisted line no longer matches the priced view', async () => {
      cartOf([cartLine({ id: 'item-1', offerId: 'offer-1', quantity: 2 })]);
      cartService.getCheckoutSnapshot.mockResolvedValue([
        {
          id: 'item-1',
          offerId: 'offer-1',
          quantity: 3,
          revision: 4,
          createdAt: new Date(),
        },
      ]);

      await expect(
        service.createFromCart('user-1', 'addr-1', 'USD'),
      ).rejects.toThrow('Cart changed; review your cart and check out again');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a cart whose selected line vanished between the view and the snapshot', async () => {
      cartOf([cartLine({ id: 'item-1', offerId: 'offer-1' })]);
      cartService.getCheckoutSnapshot.mockResolvedValue([]);

      await expect(
        service.createFromCart('user-1', 'addr-1', 'USD'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('takes its locks in the global order: attempt, cart, offers, inventory records, then reservations', async () => {
      cartOf([
        cartLine({ id: 'item-1', offerId: 'offer-1' }),
        cartLine({ id: 'item-2', offerId: 'offer-2' }),
      ]);

      await service.createFromCart(
        'user-1',
        'addr-1',
        'USD',
        undefined,
        'key-1',
        FENCE,
      );

      const sequence = [
        callOrder(prisma.order.create),
        callOrder(prisma.checkoutAttempt.updateMany),
        callOrder(cartService.lockAndVerifyCheckoutSnapshot),
        callOrder(inventoryService.lockOffersForKeyShare),
        callOrder(inventoryService.lockStockPools),
        callOrder(inventoryService.reserve),
        callOrder(backgroundJobs.enqueue),
      ];
      expect(sequence).toEqual([...sequence].sort((a, b) => a - b));
      expect(sequence.every(Number.isFinite)).toBe(true);
      expect(inventoryService.lockOffersForKeyShare).toHaveBeenCalledWith(
        ['offer-1', 'offer-2'],
        prisma,
      );
      expect(inventoryService.lockStockPools).toHaveBeenCalledWith(
        [
          expect.objectContaining({ id: 'offer-1', stockSource: 'PLATFORM' }),
          expect.objectContaining({ id: 'offer-2', stockSource: 'PLATFORM' }),
        ],
        prisma,
      );
      // Every reservation is confined to the records locked up front.
      for (const [, , options] of inventoryService.reserve.mock.calls as [
        string,
        number,
        { lockedRecordIds?: string[] },
      ][])
        expect(options.lockedRecordIds).toEqual(['record-1']);
      expect(backgroundJobs.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CART_CLEANUP_JOB_TYPE,
          payload: { userId: 'user-1', orderId: 'order-1' },
          maxAttempts: 20,
        }),
        prisma,
      );
    });

    it('links the order to the attempt only while the fence still holds', async () => {
      cartOf([cartLine({ id: 'item-1', offerId: 'offer-1' })]);
      const before = Date.now();

      await service.createFromCart(
        'user-1',
        'addr-1',
        'USD',
        undefined,
        'key-1',
        FENCE,
      );

      const [{ where, data }] = prisma.checkoutAttempt.updateMany.mock
        .calls[0] as [
        {
          where: Record<string, unknown>;
          data: { orderId: string; stage: string; leaseExpiresAt: Date };
        },
      ];
      expect(where).toEqual({
        id: 'attempt-1',
        ownerToken: 'owner-1',
        status: 'IN_PROGRESS',
        orderId: null,
      });
      expect(data).toEqual({
        orderId: 'order-1',
        stage: 'ORDER_CREATED',
        leaseExpiresAt: expect.any(Date) as unknown,
      });
      expect(data.leaseExpiresAt.getTime()).toBeGreaterThanOrEqual(
        before + CHECKOUT_ATTEMPT_LEASE_MS,
      );
    });

    it('is superseded, reserving nothing, when another request owns the attempt now', async () => {
      cartOf([cartLine({ id: 'item-1', offerId: 'offer-1' })]);
      prisma.checkoutAttempt.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.createFromCart(
          'user-1',
          'addr-1',
          'USD',
          undefined,
          'key-1',
          FENCE,
        ),
      ).rejects.toBeInstanceOf(CheckoutAttemptSupersededError);
      expect(cartService.lockAndVerifyCheckoutSnapshot).not.toHaveBeenCalled();
      expect(inventoryService.lockStockPools).not.toHaveBeenCalled();
      expect(inventoryService.reserve).not.toHaveBeenCalled();
      expect(backgroundJobs.enqueue).not.toHaveBeenCalled();
    });

    it('never touches checkout attempts for a keyless order', async () => {
      cartOf([cartLine({ id: 'item-1', offerId: 'offer-1' })]);

      await service.createFromCart('user-1', 'addr-1', 'USD');

      expect(prisma.checkoutAttempt.updateMany).not.toHaveBeenCalled();
      const [{ data }] = prisma.order.create.mock.calls[0] as [
        {
          data: Record<string, unknown>;
        },
      ];
      expect(data.idempotencyKey).toBeNull();
    });

    it('reserves in cart line (createdAt, id) order, not seller or cart-view order', async () => {
      // Seller 'b' was added first; seller groups sort 'a' first and the view
      // has no ORDER BY, but the cart's stock check allocated in line order.
      const lineB = cartLine({
        id: 'item-b',
        offerId: 'offer-b',
        sellerId: 'seller-b',
        quantity: 3,
      });
      const lineA = cartLine({
        id: 'item-a',
        offerId: 'offer-a',
        sellerId: 'seller-a',
        quantity: 5,
      });
      cartService.getCartView.mockResolvedValue({
        items: [lineA, lineB],
        subtotal: 0,
        currency: 'USD',
      });
      cartService.getCheckoutSnapshot.mockResolvedValue([
        {
          id: 'item-b',
          offerId: 'offer-b',
          quantity: 3,
          revision: 0,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'item-a',
          offerId: 'offer-a',
          quantity: 5,
          revision: 0,
          createdAt: new Date('2026-01-01T00:00:01Z'),
        },
      ]);
      prisma.offer.findMany.mockResolvedValue([
        { ...platformOffer('offer-a', 'variant-1'), sellerId: 'seller-a' },
        { ...platformOffer('offer-b', 'variant-1'), sellerId: 'seller-b' },
      ]);
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      inventoryService.reserve.mockResolvedValue({ id: 'reservation' });
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [],
        sellerOrders: [],
      });

      await service.createFromCart('user-1', 'addr-1', 'USD');

      // Seller orders and items are still created seller 'a' first...
      expect(
        prisma.sellerOrder.create.mock.calls.map(
          ([args]) => (args as { data: { sellerId: string } }).data.sellerId,
        ),
      ).toEqual(['seller-a', 'seller-b']);
      // ...but every item exists before the first reservation...
      expect(callOrder(prisma.shippingGroup.create, 1)).toBeLessThan(
        callOrder(inventoryService.reserve),
      );
      // ...and stock is claimed in the canonical line order.
      expect(
        (inventoryService.reserve.mock.calls as [string, number][]).map(
          ([, quantity]) => quantity,
        ),
      ).toEqual([3, 5]);
      const [{ data }] = prisma.order.create.mock.calls[0] as [
        {
          data: { checkoutCartSnapshot: unknown[] };
        },
      ];
      expect(data.checkoutCartSnapshot).toEqual([
        { id: 'item-b', offerId: 'offer-b', quantity: 3, revision: 0 },
        { id: 'item-a', offerId: 'offer-a', quantity: 5, revision: 0 },
      ]);
    });

    it.each([
      ['an idempotency target', ['user_id', 'idempotency_key']],
      ['no target at all', undefined],
    ])(
      'reports a key collision with %s as superseded under an attempt fence',
      async (_case, target) => {
        cartOf([cartLine({ id: 'item-1', offerId: 'offer-1' })]);
        prisma.order.create.mockRejectedValue(uniqueViolation(target));

        await expect(
          service.createFromCart(
            'user-1',
            'addr-1',
            'USD',
            undefined,
            'key-1',
            FENCE,
          ),
        ).rejects.toBeInstanceOf(CheckoutAttemptSupersededError);
      },
    );

    it('reports a key collision without a fence as a plain in-progress conflict', async () => {
      cartOf([cartLine({ id: 'item-1', offerId: 'offer-1' })]);
      prisma.order.create.mockRejectedValue(
        uniqueViolation(['user_id', 'idempotency_key']),
      );

      const error = await service
        .createFromCart('user-1', 'addr-1', 'USD', undefined, 'key-1')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error).not.toBeInstanceOf(CheckoutAttemptSupersededError);
      expect((error as Error).message).toBe(
        'A checkout with this idempotency key is already in progress',
      );
    });

    it('rethrows a unique violation on anything other than the key unchanged', async () => {
      cartOf([cartLine({ id: 'item-1', offerId: 'offer-1' })]);
      const violation = uniqueViolation(['reservation_id']);
      prisma.order.create.mockRejectedValue(violation);

      await expect(
        service.createFromCart(
          'user-1',
          'addr-1',
          'USD',
          undefined,
          'key-1',
          FENCE,
        ),
      ).rejects.toBe(violation);
    });

    it('buy-now takes no cart lock, persists no snapshot and enqueues no cart cleanup', async () => {
      cartService.previewOfferLine.mockResolvedValue(
        cartLine({ offerId: 'offer-1' }),
      );
      prisma.offer.findMany.mockResolvedValue([
        platformOffer('offer-1', 'variant-1'),
      ]);
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      inventoryService.reserve.mockResolvedValue({ id: 'reservation-1' });
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [],
        sellerOrders: [],
      });

      await service.createFromOffer(
        'user-1',
        'offer-1',
        2,
        'addr-1',
        'USD',
        'key-1',
        FENCE,
      );

      const [{ data }] = prisma.order.create.mock.calls[0] as [
        {
          data: Record<string, unknown>;
        },
      ];
      expect(data).not.toHaveProperty('checkoutCartSnapshot');
      expect(cartService.getCheckoutSnapshot).not.toHaveBeenCalled();
      expect(cartService.lockAndVerifyCheckoutSnapshot).not.toHaveBeenCalled();
      expect(backgroundJobs.enqueue).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: CART_CLEANUP_JOB_TYPE }),
        expect.anything(),
      );
      // Every order, buy-now included, gets the unpaid-order reaper.
      expect(backgroundJobs.enqueue).toHaveBeenCalledTimes(1);
      expect(backgroundJobs.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: UNPAID_ORDER_EXPIRY_JOB_TYPE,
          payload: { orderId: 'order-1' },
          maxAttempts: UNPAID_ORDER_EXPIRY_MAX_ATTEMPTS,
        }),
        expect.anything(),
      );
      expect(prisma.checkoutAttempt.updateMany).toHaveBeenCalledTimes(1);
      expect(callOrder(inventoryService.lockOffersForKeyShare)).toBeLessThan(
        callOrder(inventoryService.lockStockPools),
      );
    });
  });

  describe('reads never carry the checkout cart snapshot', () => {
    beforeEach(() => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        userId: 'user-1',
        items: [],
        sellerOrders: [],
        user: { id: 'user-1', email: 'buyer@example.com' },
      });
    });

    it('ORDER_OMIT drops exactly the snapshot', () => {
      expect(ORDER_OMIT).toEqual({ checkoutCartSnapshot: true });
    });

    it.each([
      [
        'findForCheckout',
        (s: OrdersService): Promise<unknown> => s.findForCheckout('order-1'),
      ],
      [
        'findOwn',
        (s: OrdersService): Promise<unknown> => s.findOwn('user-1', 'order-1'),
      ],
      ['findAny', (s: OrdersService): Promise<unknown> => s.findAny('order-1')],
    ])('%s omits it', async (_name, read) => {
      await read(service);

      expect(prisma.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ omit: ORDER_OMIT }),
      );
    });

    it.each([
      ['listOwn', (s: OrdersService): Promise<unknown> => s.listOwn('user-1')],
      [
        'listAll',
        (s: OrdersService): Promise<unknown> =>
          s.listAll({ page: 1, limit: 20 }),
      ],
    ])('%s omits it', async (_name, read) => {
      await read(service);

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ omit: ORDER_OMIT }),
      );
    });

    it('the order a checkout creates is read back without it', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [cartLine()],
        subtotal: 2000,
        currency: 'USD',
      });
      prisma.offer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          variantId: 'variant-1',
          sellerId: null,
          stockSource: 'PLATFORM',
          fulfillmentMode: 'PLATFORM',
        },
      ]);
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      inventoryService.reserve.mockResolvedValue({ id: 'reservation-1' });

      await service.createFromCart('user-1', 'addr-1', 'USD');

      // The insert itself returns only the id, never the full row.
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({ select: { id: true } }),
      );
      expect(prisma.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          omit: ORDER_OMIT,
        }),
      );
    });
  });

  describe('quoteFromCart', () => {
    it('rejects an empty cart without touching addresses or shipping', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [],
        subtotal: 0,
        currency: null,
      });

      await expect(
        service.quoteFromCart('user-1', 'addr-1', 'USD'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(addressesService.findOne).not.toHaveBeenCalled();
    });

    it('rejects a cart with an unavailable line, same as createFromCart', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [cartLine({ isAvailable: false })],
        subtotal: 2000,
        currency: 'USD',
      });

      await expect(
        service.quoteFromCart('user-1', 'addr-1', 'USD'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns subtotal, shipping, and a total that adds up, without creating anything', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [cartLine()],
        subtotal: 2000,
        currency: 'USD',
      });
      prisma.offer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          variantId: 'variant-1',
          sellerId: null,
          stockSource: 'PLATFORM',
          fulfillmentMode: 'PLATFORM',
        },
      ]);
      shippingService.quoteSellerGroups.mockResolvedValue([
        {
          fulfillmentMode: 'PLATFORM',
          serviceLevel: 'STANDARD',
          rateCode: 'DOMESTIC_FLAT_V1',
          subtotal: 2000,
          shippingAmount: 500,
          total: 2500,
          currency: 'USD',
          items: [cartLine()],
          quoteId: 'quote-1',
          quoteExpiresAt: new Date(Date.now() + 60_000),
          estimatedDeliveryMinDays: 2,
          estimatedDeliveryMaxDays: 5,
        },
      ]);

      const quote = await service.quoteFromCart('user-1', 'addr-1', 'USD');

      expect(quote).toEqual({
        currency: 'USD',
        subtotal: 2000,
        shippingAmount: 500,
        total: 2500,
        shippingGroups: [
          {
            sellerId: null,
            fulfillmentMode: 'PLATFORM',
            serviceLevel: 'STANDARD',
            subtotal: 2000,
            shippingAmount: 500,
            total: 2500,
            estimatedDeliveryMinDays: 2,
            estimatedDeliveryMaxDays: 5,
          },
        ],
      });
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(inventoryService.reserve).not.toHaveBeenCalled();
    });

    it("quotes only the selected lines, matching createFromCart's partial checkout", async () => {
      cartService.getCartView.mockResolvedValue({
        items: [
          cartLine({ id: 'item-1', offerId: 'offer-1' }),
          cartLine({ id: 'item-2', offerId: 'offer-2' }),
        ],
        subtotal: 4000,
        currency: 'USD',
      });
      prisma.offer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          variantId: 'variant-1',
          sellerId: null,
          stockSource: 'PLATFORM',
          fulfillmentMode: 'PLATFORM',
        },
      ]);

      const quote = await service.quoteFromCart('user-1', 'addr-1', 'USD', [
        'item-1',
      ]);

      expect(quote.subtotal).toBe(2000);
    });
  });

  describe('quoteFromOffer', () => {
    it('rejects an offer previewOfferLine reports unavailable', async () => {
      cartService.previewOfferLine.mockResolvedValue(
        cartLine({ isAvailable: false }),
      );

      await expect(
        service.quoteFromOffer('user-1', 'offer-1', 2, 'addr-1', 'USD'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('quotes a single offer without ever reading the cart or creating an order', async () => {
      cartService.previewOfferLine.mockResolvedValue(cartLine());
      prisma.offer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          variantId: 'variant-1',
          sellerId: null,
          stockSource: 'PLATFORM',
          fulfillmentMode: 'PLATFORM',
        },
      ]);

      const quote = await service.quoteFromOffer(
        'user-1',
        'offer-1',
        2,
        'addr-1',
        'USD',
      );

      expect(cartService.previewOfferLine).toHaveBeenCalledWith(
        'offer-1',
        2,
        'USD',
      );
      expect(cartService.getCartView).not.toHaveBeenCalled();
      expect(quote.subtotal).toBe(2000);
      expect(quote.total).toBe(quote.subtotal + quote.shippingAmount);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmPayment', () => {
    it('commits every reservation, marks the order and every SellerOrder PAID, and records a sale per seller order', async () => {
      const platformGroup = { id: 'so-platform', sellerId: null, total: 1000 };
      const sellerGroup = { id: 'so-a', sellerId: 'seller-a', total: 2000 };
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING_PAYMENT,
        items: [{ id: 'item-1', reservationId: 'reservation-1' }],
        sellerOrders: [platformGroup, sellerGroup],
      });

      await service.confirmPayment('order-1');

      expect(inventoryService.commitMany).toHaveBeenCalledWith(
        ['reservation-1'],
        prisma,
      );
      expect(inventoryService.commit).not.toHaveBeenCalled();
      expect(prisma.sellerOrder.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        data: { status: OrderStatus.PAID },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.PAID },
        omit: ORDER_OMIT,
      });
      expect(ledgerService.recordSale).toHaveBeenCalledWith(
        platformGroup,
        prisma,
      );
      expect(ledgerService.recordSale).toHaveBeenCalledWith(
        sellerGroup,
        prisma,
      );
      expect(ledgerService.recordSale).toHaveBeenCalledTimes(2);
    });

    it('locks the order row before committing every reservation in one batch', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        userId: 'user-1',
        status: OrderStatus.PENDING_PAYMENT,
        items: [
          { id: 'item-1', reservationId: 'reservation-2' },
          { id: 'item-2', reservationId: 'reservation-1' },
        ],
        sellerOrders: [],
      });

      await service.confirmPayment('order-1');

      const [lock] = rawQueries(prisma.$queryRaw);
      expect(lock?.sql).toMatch(/FROM orders WHERE id = \?::uuid FOR UPDATE/);
      expect(lock?.values).toEqual(['order-1']);
      expect(callOrder(prisma.$queryRaw)).toBeLessThan(
        callOrder(inventoryService.commitMany),
      );
      expect(inventoryService.commitMany).toHaveBeenCalledTimes(1);
      expect(inventoryService.commitMany).toHaveBeenCalledWith(
        ['reservation-2', 'reservation-1'],
        prisma,
      );
    });

    it('enqueues the cart cleanup job in the transaction when the order came from a cart', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        userId: 'user-1',
        status: OrderStatus.PENDING_PAYMENT,
        items: [],
        sellerOrders: [],
      });
      prisma.order.findUniqueOrThrow.mockResolvedValue({
        checkoutCartSnapshot: [
          { id: 'item-1', offerId: 'o', quantity: 1, revision: 0 },
        ],
      });

      await service.confirmPayment('order-1');

      expect(prisma.order.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        select: { checkoutCartSnapshot: true },
      });
      expect(backgroundJobs.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CART_CLEANUP_JOB_TYPE,
          payload: { userId: 'user-1', orderId: 'order-1' },
          maxAttempts: 20,
        }),
        prisma,
      );
    });

    it('enqueues no cart cleanup for a buy-now or legacy order without a snapshot', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        userId: 'user-1',
        status: OrderStatus.PENDING_PAYMENT,
        items: [],
        sellerOrders: [],
      });

      await service.confirmPayment('order-1');

      expect(backgroundJobs.enqueue).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: CART_CLEANUP_JOB_TYPE }),
        expect.anything(),
      );
    });

    it('is idempotent for an order that is already paid', async () => {
      const paid = {
        id: 'order-1',
        status: OrderStatus.PAID,
        items: [{ id: 'item-1', reservationId: 'reservation-1' }],
        sellerOrders: [],
      };
      prisma.order.findUnique.mockResolvedValue(paid);

      await expect(service.confirmPayment('order-1')).resolves.toBe(paid);

      expect(inventoryService.commitMany).not.toHaveBeenCalled();
      expect(backgroundJobs.enqueue).not.toHaveBeenCalled();
    });

    it('refuses to pay a cancelled order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.CANCELLED,
        items: [],
        sellerOrders: [],
      });

      await expect(service.confirmPayment('order-1')).rejects.toThrow(
        'Only a pending order can be paid',
      );
      expect(inventoryService.commitMany).not.toHaveBeenCalled();
    });
  });

  describe('getSellerOrderForPayment', () => {
    it('throws not found when the seller order does not exist', async () => {
      prisma.sellerOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.getSellerOrderForPayment('so-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the order state for the locked refund coordinator to validate', async () => {
      prisma.sellerOrder.findUnique.mockResolvedValue({
        id: 'so-1',
        status: OrderStatus.PENDING_PAYMENT,
      });

      await expect(
        service.getSellerOrderForPayment('so-1'),
      ).resolves.toMatchObject({ status: OrderStatus.PENDING_PAYMENT });
    });

    it('returns a PAID seller order', async () => {
      const sellerOrder = { id: 'so-1', status: OrderStatus.PAID };
      prisma.sellerOrder.findUnique.mockResolvedValue(sellerOrder);

      await expect(service.getSellerOrderForPayment('so-1')).resolves.toBe(
        sellerOrder,
      );
    });
  });

  describe('applyRefund', () => {
    it('rejects a refund amount exceeding the remaining refundable balance', async () => {
      prisma.sellerOrder.findUnique.mockResolvedValue({
        id: 'so-1',
        orderId: 'order-1',
        status: OrderStatus.PAID,
        total: 1000,
        refundedAmount: 900,
        items: [],
      });

      await expect(service.applyRefund('so-1', 200)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('marks PARTIALLY_REFUNDED and does not restock when not fully refunded', async () => {
      prisma.sellerOrder.findUnique.mockResolvedValue({
        id: 'so-1',
        orderId: 'order-1',
        status: OrderStatus.PAID,
        total: 1000,
        refundedAmount: 0,
        items: [{ id: 'item-1', reservationId: 'reservation-1' }],
      });
      prisma.sellerOrder.update.mockResolvedValue({
        id: 'so-1',
        status: OrderStatus.PARTIALLY_REFUNDED,
      });

      await service.applyRefund('so-1', 400);

      expect(prisma.sellerOrder.update).toHaveBeenCalledWith({
        where: { id: 'so-1' },
        data: { refundedAmount: 400, status: OrderStatus.PARTIALLY_REFUNDED },
      });
      expect(inventoryService.restock).not.toHaveBeenCalled();
    });

    it('marks REFUNDED without restocking reservation stock once fully refunded', async () => {
      prisma.sellerOrder.findUnique.mockResolvedValue({
        id: 'so-1',
        orderId: 'order-1',
        status: OrderStatus.PAID,
        total: 1000,
        refundedAmount: 600,
        items: [
          { id: 'item-1', reservationId: 'reservation-1' },
          { id: 'item-2', reservationId: null },
        ],
      });
      prisma.sellerOrder.update.mockResolvedValue({
        id: 'so-1',
        status: OrderStatus.REFUNDED,
      });

      await service.applyRefund('so-1', 400);

      expect(prisma.sellerOrder.update).toHaveBeenCalledWith({
        where: { id: 'so-1' },
        data: { refundedAmount: 1000, status: OrderStatus.REFUNDED },
      });
      // A refund is a money event only now — restocking happens through the
      // Returns module once inspected quantity is dispositioned RESTOCK.
      expect(inventoryService.restock).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('releases every reservation and marks the order and every SellerOrder CANCELLED', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING_PAYMENT,
        items: [{ id: 'item-1', reservationId: 'reservation-1' }],
      });

      await service.cancel('order-1');

      expect(inventoryService.releaseMany).toHaveBeenCalledWith(
        ['reservation-1'],
        prisma,
      );
      expect(inventoryService.release).not.toHaveBeenCalled();
      expect(prisma.sellerOrder.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        data: { status: OrderStatus.CANCELLED },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.CANCELLED },
        omit: ORDER_OMIT,
      });
    });

    it('locks the order row before releasing its reservations in one batch', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING_PAYMENT,
        items: [
          { id: 'item-1', reservationId: 'reservation-2' },
          { id: 'item-2', reservationId: null },
          { id: 'item-3', reservationId: 'reservation-1' },
        ],
      });

      await service.cancel('order-1');

      const [lock] = rawQueries(prisma.$queryRaw);
      expect(lock?.sql).toMatch(/FROM orders WHERE id = \?::uuid FOR UPDATE/);
      expect(lock?.values).toEqual(['order-1']);
      expect(callOrder(prisma.$queryRaw)).toBeLessThan(
        callOrder(prisma.order.findUnique),
      );
      // Items without a reservation are skipped; ordering is releaseMany's.
      expect(inventoryService.releaseMany).toHaveBeenCalledTimes(1);
      expect(inventoryService.releaseMany).toHaveBeenCalledWith(
        ['reservation-2', 'reservation-1'],
        prisma,
      );
      expect(prisma.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ omit: ORDER_OMIT }),
      );
    });

    it('is a no-op for an order that is already cancelled', async () => {
      const cancelled = {
        id: 'order-1',
        status: OrderStatus.CANCELLED,
        items: [{ id: 'item-1', reservationId: 'reservation-1' }],
      };
      prisma.order.findUnique.mockResolvedValue(cancelled);

      await expect(service.cancel('order-1')).resolves.toBe(cancelled);

      expect(inventoryService.releaseMany).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('refuses to cancel a paid order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PAID,
        items: [{ id: 'item-1', reservationId: 'reservation-1' }],
      });

      await expect(service.cancel('order-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(inventoryService.releaseMany).not.toHaveBeenCalled();
    });

    it('opens one transaction of its own when called standalone and reuses a caller transaction', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING_PAYMENT,
        items: [],
      });

      await service.cancel('order-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      await service.cancel('order-1', prisma as never);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOwn', () => {
    it('throws not found when the order belongs to someone else', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        userId: 'someone-else',
        items: [],
      });

      await expect(service.findOwn('user-1', 'order-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findAny', () => {
    it('throws not found for an unknown order', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.findAny('order-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('joins product names and the customer in the one query', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        userId: 'user-1',
        user: { id: 'user-1', email: 'buyer@example.com' },
        sellerOrders: [],
        items: [
          {
            id: 'item-1',
            offerId: 'offer-1',
            offer: {
              sellerSku: null,
              listingTitle: null,
              variant: {
                id: 'variant-1',
                skuCode: 'SKU-1',
                name: null,
                product: { id: 'product-1', name: 'Kettle', slug: 'kettle' },
              },
            },
          },
        ],
      });

      const order = await service.findAny('order-1');

      expect(prisma.order.findUnique).toHaveBeenCalledTimes(1);
      const [query] = prisma.order.findUnique.mock.calls[0] as [
        {
          where: unknown;
          include: { items: { include: { offer: unknown } }; user: unknown };
        },
      ];
      expect(query.where).toEqual({ id: 'order-1' });
      expect(query.include.items.include.offer).toBeDefined();
      expect(query.include.user).toBeDefined();
      expect(order.customer).toEqual({
        id: 'user-1',
        email: 'buyer@example.com',
      });
      expect(order.items[0]).toMatchObject({
        product: { name: 'Kettle' },
        variant: { skuCode: 'SKU-1' },
      });
    });
  });
});
