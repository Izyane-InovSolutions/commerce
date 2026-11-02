import { ConflictException } from '@nestjs/common';
import {
  CartStatus,
  OfferStockSource,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  SellerStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { MAX_INT4, type StockPoolKey } from '../inventory/stock-allocation';
import {
  OfferReadService,
  type CommerceOffer,
} from '../offers/offer-read.service';
import { CartService } from './cart.service';

/*
 * These specs drive CartService against a small in-memory stand-in for the
 * Prisma client, so they can assert on the resulting cart state rather than
 * on individual calls. A transaction that throws is rolled back, as
 * PostgreSQL would, which is what the all-or-nothing rules rely on.
 */

type CartRow = {
  id: string;
  userId: string | null;
  guestToken: string | null;
  status: CartStatus;
};

type ItemRow = {
  id: string;
  cartId: string;
  offerId: string;
  quantity: number;
  revision: number;
  createdAt: Date;
};

type OrderRow = {
  id: string;
  userId: string;
  status: OrderStatus;
  checkoutCartSnapshot: Prisma.JsonValue | null;
  payment: { status: PaymentStatus; providerReference: string | null } | null;
};

type Where = Record<string, unknown>;
type OrderBy = Array<Record<string, 'asc' | 'desc'>>;

function fieldMatches(value: unknown, condition: unknown): boolean {
  if (
    condition !== null &&
    typeof condition === 'object' &&
    !(condition instanceof Date) &&
    'in' in condition
  ) {
    return (condition as { in: unknown[] }).in.includes(value);
  }
  return value === condition;
}

function rowMatches<T extends object>(row: T, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) =>
    fieldMatches(row[key as keyof T], condition),
  );
}

function pick<T extends object>(
  row: T,
  select: Record<string, boolean> | undefined,
): Partial<T> {
  if (!select) return { ...row };
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => select[key]),
  ) as Partial<T>;
}

function compareBy(
  orderBy: OrderBy | undefined,
): (a: ItemRow, b: ItemRow) => number {
  return (a: ItemRow, b: ItemRow): number => {
    for (const clause of orderBy ?? []) {
      const [field, direction] = Object.entries(clause)[0] as [
        keyof ItemRow,
        'asc' | 'desc',
      ];
      const left = a[field];
      const right = b[field];
      const order =
        left instanceof Date && right instanceof Date
          ? left.getTime() - right.getTime()
          : String(left).localeCompare(String(right));
      if (order !== 0) return direction === 'asc' ? order : -order;
    }
    return 0;
  };
}

function applyData<T extends object>(row: T, data: Where): void {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const target = row as Record<string, unknown>;
    if (value !== null && typeof value === 'object' && 'increment' in value) {
      target[key] =
        (target[key] as number) + (value as { increment: number }).increment;
    } else {
      target[key] = value;
    }
  }
}

class FakeCartDb {
  carts: CartRow[] = [];
  items: ItemRow[] = [];
  orders: OrderRow[] = [];
  /** Every row lock taken, as "table:id", in order. */
  locks: string[] = [];
  rollbacks = 0;
  private clock = Date.UTC(2026, 0, 1);
  private sequence = 0;

  now(): Date {
    this.clock += 1000;
    return new Date(this.clock);
  }

  addCart(cart: Partial<CartRow> & { id: string }): CartRow {
    const row: CartRow = {
      userId: null,
      guestToken: null,
      status: CartStatus.ACTIVE,
      ...cart,
    };
    this.carts.push(row);
    return row;
  }

  addItem(
    item: Omit<ItemRow, 'revision' | 'createdAt'> &
      Partial<Pick<ItemRow, 'revision' | 'createdAt'>>,
  ): ItemRow {
    const row: ItemRow = {
      revision: 0,
      createdAt: this.now(),
      ...item,
    };
    this.items.push(row);
    return row;
  }

  item(cartId: string, offerId: string): ItemRow | undefined {
    return this.items.find(
      (row) => row.cartId === cartId && row.offerId === offerId,
    );
  }

  linesOf(cartId: string): Array<Pick<ItemRow, 'offerId' | 'quantity'>> {
    return this.items
      .filter((row) => row.cartId === cartId)
      .map(({ offerId, quantity }) => ({ offerId, quantity }))
      .sort((a, b) => a.offerId.localeCompare(b.offerId));
  }

  private itemMatches(item: ItemRow, where: Where): boolean {
    return Object.entries(where).every(([key, condition]) => {
      if (key === 'OR') {
        return (condition as Where[]).some((branch) =>
          this.itemMatches(item, branch),
        );
      }
      if (key === 'cart') {
        const cart = this.carts.find((row) => row.id === item.cartId);
        return !!cart && rowMatches(cart, condition as Where);
      }
      return fieldMatches(item[key as keyof ItemRow], condition);
    });
  }

  private cartWithItems(
    cart: CartRow,
    args: { include?: { items?: boolean }; select?: Record<string, boolean> },
  ): object {
    if (args.select) return pick(cart, args.select);
    return args.include?.items
      ? {
          ...cart,
          items: this.items
            .filter((row) => row.cartId === cart.id)
            .map((row) => ({ ...row })),
        }
      : { ...cart };
  }

  /** What a transaction callback receives: the same client, untyped here. */
  private transactionClient(): unknown {
    return this.client;
  }

  readonly client = {
    cart: {
      findUnique: jest.fn(
        (args: {
          where: Where;
          include?: { items?: boolean };
          select?: Record<string, boolean>;
        }) => {
          const cart = this.carts.find((row) => rowMatches(row, args.where));
          return Promise.resolve(cart ? this.cartWithItems(cart, args) : null);
        },
      ),
      findUniqueOrThrow: jest.fn((args: { where: Where }) => {
        const cart = this.carts.find((row) => rowMatches(row, args.where));
        return cart
          ? Promise.resolve({ ...cart })
          : Promise.reject(new Error('cart not found'));
      }),
      findFirst: jest.fn((args: { where: Where }) => {
        const cart = this.carts.find((row) => rowMatches(row, args.where));
        return Promise.resolve(cart ? { ...cart } : null);
      }),
      create: jest.fn((args: { data: Partial<CartRow> }) => {
        this.sequence += 1;
        return Promise.resolve({
          ...this.addCart({ id: `cart-new-${this.sequence}`, ...args.data }),
        });
      }),
      update: jest.fn((args: { where: { id: string }; data: Where }) => {
        const cart = this.carts.find((row) => row.id === args.where.id);
        if (!cart) return Promise.reject(new Error('cart not found'));
        applyData(cart, args.data);
        return Promise.resolve({ ...cart });
      }),
    },
    cartItem: {
      findUnique: jest.fn(
        (args: {
          where: { cartId_offerId: { cartId: string; offerId: string } };
        }) => {
          const { cartId, offerId } = args.where.cartId_offerId;
          const item = this.item(cartId, offerId);
          return Promise.resolve(item ? { ...item } : null);
        },
      ),
      findFirst: jest.fn((args: { where: Where }) => {
        const item = this.items.find((row) =>
          this.itemMatches(row, args.where),
        );
        return Promise.resolve(item ? { ...item } : null);
      }),
      findMany: jest.fn(
        (args: {
          where: Where;
          select?: Record<string, boolean>;
          orderBy?: OrderBy;
        }) =>
          Promise.resolve(
            this.items
              .filter((row) => this.itemMatches(row, args.where))
              .sort(compareBy(args.orderBy))
              .map((row) => pick(row, args.select)),
          ),
      ),
      upsert: jest.fn(
        (args: {
          where: { cartId_offerId: { cartId: string; offerId: string } };
          create: { cartId: string; offerId: string; quantity: number };
          update: Where;
        }) => {
          const { cartId, offerId } = args.where.cartId_offerId;
          const existing = this.item(cartId, offerId);
          if (existing) {
            applyData(existing, args.update);
            return Promise.resolve({ ...existing });
          }
          this.sequence += 1;
          // Generated ids sort before every seeded id, so a test can tell
          // ordering by createdAt apart from ordering by id.
          return Promise.resolve({
            ...this.addItem({ id: `0-new-${this.sequence}`, ...args.create }),
          });
        },
      ),
      update: jest.fn((args: { where: { id: string }; data: Where }) => {
        const item = this.items.find((row) => row.id === args.where.id);
        if (!item) return Promise.reject(new Error('item not found'));
        applyData(item, args.data);
        return Promise.resolve({ ...item });
      }),
      deleteMany: jest.fn((args: { where: Where }) => {
        const before = this.items.length;
        this.items = this.items.filter(
          (row) => !this.itemMatches(row, args.where),
        );
        return Promise.resolve({ count: before - this.items.length });
      }),
    },
    order: {
      findFirst: jest.fn((args: { where: Where }) => {
        const order = this.orders.find((row) => rowMatches(row, args.where));
        return Promise.resolve(order ? structuredClone(order) : null);
      }),
    },
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const table = /FROM (\w+)/.exec(strings.join('?'))?.[1] ?? 'unknown';
        this.locks.push(`${table}:${String(values[0])}`);
        return Promise.resolve([]);
      },
    ),
    $transaction: jest.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const saved = structuredClone({ carts: this.carts, items: this.items });
        try {
          return await callback(this.transactionClient());
        } catch (error) {
          this.carts = saved.carts;
          this.items = saved.items;
          this.rollbacks += 1;
          throw error;
        }
      },
    ),
  };
}

function buildOffer(
  id: string,
  overrides: Partial<{
    variantId: string;
    stockSource: OfferStockSource;
    sellerId: string | null;
  }> = {},
): CommerceOffer {
  const sellerId = overrides.sellerId ?? null;
  return {
    id,
    variantId: overrides.variantId ?? 'variant-1',
    sellerId,
    status: ProductStatus.PUBLISHED,
    stockSource: overrides.stockSource ?? OfferStockSource.PLATFORM,
    seller: sellerId ? { status: SellerStatus.APPROVED } : null,
    prices: [
      {
        id: `price-${id}`,
        amount: 1000,
        currency: 'USD',
        startsAt: new Date(Date.UTC(2020, 0, 1)),
        endsAt: null,
      },
    ],
  } as unknown as CommerceOffer;
}

function conflictBody(error: unknown): unknown {
  expect(error).toBeInstanceOf(ConflictException);
  return (error as ConflictException).getResponse();
}

describe('CartService (stateful)', () => {
  let db: FakeCartDb;
  let offers: Map<string, CommerceOffer>;
  /** Allocatable stock per pool key, record by record in ascending id. */
  let stock: Map<string, number[]>;
  let getAllocatableStock: jest.Mock;
  let service: CartService;

  const user = { userId: 'user-1' };

  beforeEach(() => {
    db = new FakeCartDb();
    offers = new Map(
      ['offer-1', 'offer-2', 'offer-3'].map((id) => [id, buildOffer(id)]),
    );
    stock = new Map();
    getAllocatableStock = jest.fn((pools: StockPoolKey[]) =>
      Promise.resolve(
        new Map(
          pools.map((pool) => {
            const key =
              pool.kind === 'offer'
                ? `offer:${pool.offerId}`
                : `variant:${pool.variantId}`;
            return [key, stock.get(key) ?? []];
          }),
        ),
      ),
    );
    const plenty = (ids: string[]): Promise<Map<string, number>> =>
      Promise.resolve(new Map(ids.map((id) => [id, 1_000_000])));

    service = new CartService(
      db.client as unknown as PrismaService,
      {
        getAllocatableStock,
        getAvailableQuantities: jest.fn(plenty),
        getAvailableOfferQuantities: jest.fn(plenty),
      } as unknown as InventoryService,
      {
        find: jest.fn((id: string) => Promise.resolve(offers.get(id) ?? null)),
        findMany: jest.fn((ids: string[]) =>
          Promise.resolve(
            [...new Set(ids)].flatMap((id) => {
              const offer = offers.get(id);
              return offer ? [offer] : [];
            }),
          ),
        ),
      } as unknown as OfferReadService,
    );

    db.addCart({ id: 'cart-1', userId: 'user-1' });
  });

  describe('stock check', () => {
    it('aggregates every line drawing on a shared variant pool', async () => {
      offers.set('offer-2', buildOffer('offer-2', { sellerId: 'seller-1' }));
      db.addItem({
        id: 'item-1',
        cartId: 'cart-1',
        offerId: 'offer-1',
        quantity: 4,
      });
      stock.set('variant:variant-1', [6]);

      const error = await service
        .addItem(user, 'offer-2', 3, 'USD')
        .catch((caught: unknown) => caught);

      expect(conflictBody(error)).toEqual({
        message: 'Requested quantity exceeds available stock',
        details: [
          { field: 'offerId', message: 'offer-2' },
          { field: 'available', message: '6' },
        ],
      });
      expect(getAllocatableStock).toHaveBeenCalledTimes(1);
      expect(getAllocatableStock).toHaveBeenCalledWith(
        [{ kind: 'variant', variantId: 'variant-1' }],
        db.client,
      );
      expect(db.linesOf('cart-1')).toEqual([
        { offerId: 'offer-1', quantity: 4 },
      ]);
    });

    it('accepts a shared pool when every line fits a record whole', async () => {
      db.addItem({
        id: 'item-1',
        cartId: 'cart-1',
        offerId: 'offer-1',
        quantity: 4,
      });
      stock.set('variant:variant-1', [4, 3]);

      await service.addItem(user, 'offer-2', 3, 'USD');

      expect(db.linesOf('cart-1')).toEqual([
        { offerId: 'offer-1', quantity: 4 },
        { offerId: 'offer-2', quantity: 3 },
      ]);
    });

    it('refuses a line no single record can hold even when the pool total suffices', async () => {
      stock.set('variant:variant-1', [4, 5]);

      const error = await service
        .addItem(user, 'offer-1', 6, 'USD')
        .catch((caught: unknown) => caught);

      expect(conflictBody(error)).toMatchObject({
        details: [
          { field: 'offerId', message: 'offer-1' },
          { field: 'available', message: '9' },
        ],
      });
      expect(db.linesOf('cart-1')).toEqual([]);
    });

    it('keeps a seller-stocked offer in its own pool, apart from its variant', async () => {
      offers.set(
        'offer-3',
        buildOffer('offer-3', {
          sellerId: 'seller-1',
          stockSource: OfferStockSource.SELLER,
        }),
      );
      db.addItem({
        id: 'item-1',
        cartId: 'cart-1',
        offerId: 'offer-1',
        quantity: 5,
      });
      // The variant pool is exactly used up by offer-1; offer-3 must not be
      // counted against it.
      stock.set('variant:variant-1', [5]);
      stock.set('offer:offer-3', [5]);

      await service.addItem(user, 'offer-3', 5, 'USD');

      expect(getAllocatableStock).toHaveBeenCalledWith(
        [{ kind: 'offer', offerId: 'offer-3' }],
        db.client,
      );
      expect(db.item('cart-1', 'offer-3')?.quantity).toBe(5);
    });

    it('checks only the pools whose demand increased', async () => {
      offers.set(
        'offer-3',
        buildOffer('offer-3', {
          sellerId: 'seller-1',
          stockSource: OfferStockSource.SELLER,
        }),
      );
      // Stock for offer-1's pool fell below what the cart holds.
      db.addItem({
        id: 'item-1',
        cartId: 'cart-1',
        offerId: 'offer-1',
        quantity: 5,
      });
      stock.set('variant:variant-1', [1]);
      stock.set('offer:offer-3', [2]);

      await service.addItem(user, 'offer-3', 2, 'USD');

      expect(getAllocatableStock).toHaveBeenCalledWith(
        [{ kind: 'offer', offerId: 'offer-3' }],
        db.client,
      );
      expect(db.linesOf('cart-1')).toEqual([
        { offerId: 'offer-1', quantity: 5 },
        { offerId: 'offer-3', quantity: 2 },
      ]);
    });

    describe('first-fit ordering (cart line createdAt, then id)', () => {
      // Two warehouses hold the variant: the lower-id record has 5, the other
      // 3. The order lines are allocated in decides whether both fit.
      beforeEach(() => {
        stock.set('variant:variant-1', [5, 3]);
      });

      it('rejects when the earlier line takes the low-id record first and the later line no longer fits', async () => {
        db.addItem({
          id: 'item-1',
          cartId: 'cart-1',
          offerId: 'offer-1',
          quantity: 3,
        });

        // [3, 5]: 3 goes to the 5-record, leaving 2; 5 fits nowhere.
        await expect(
          service.addItem(user, 'offer-2', 5, 'USD'),
        ).rejects.toThrow('Requested quantity exceeds available stock');
        expect(db.item('cart-1', 'offer-2')).toBeUndefined();
      });

      it('orders a newly added line after existing ones by its stored createdAt, not by id', async () => {
        db.addItem({
          id: 'item-1',
          cartId: 'cart-1',
          offerId: 'offer-1',
          quantity: 5,
        });

        // [5, 3] fits. The new line's id sorts before item-1, so ordering by
        // id alone would allocate [3, 5] and refuse it.
        await service.addItem(user, 'offer-2', 3, 'USD');

        const added = db.item('cart-1', 'offer-2');
        expect(added?.id.localeCompare('item-1')).toBeLessThan(0);
        expect(added?.quantity).toBe(3);
      });

      it.each([
        ['item-a holds 5, item-b holds 3', 5, 3, true],
        ['item-a holds 3, item-b holds 5', 3, 5, false],
      ])(
        'breaks createdAt ties by line id (%s)',
        async (_label, first, second, accepted) => {
          const createdAt = new Date(Date.UTC(2025, 5, 1));
          db.addItem({
            id: 'item-b',
            cartId: 'cart-1',
            offerId: 'offer-2',
            quantity: second - 1,
            createdAt,
          });
          db.addItem({
            id: 'item-a',
            cartId: 'cart-1',
            offerId: 'offer-1',
            quantity: first,
            createdAt,
          });

          const result = service.updateItemQuantity(
            user,
            'item-b',
            second,
            'USD',
          );

          if (accepted) {
            await expect(result).resolves.toBeDefined();
            expect(db.item('cart-1', 'offer-2')?.quantity).toBe(second);
          } else {
            await expect(result).rejects.toThrow(
              'Requested quantity exceeds available stock',
            );
            expect(db.item('cart-1', 'offer-2')?.quantity).toBe(second - 1);
          }
        },
      );
    });

    describe('quantity overflow', () => {
      it('accepts a line of exactly the int4 maximum', async () => {
        stock.set('variant:variant-1', [MAX_INT4]);

        await service.addItem(user, 'offer-1', MAX_INT4, 'USD');

        expect(db.item('cart-1', 'offer-1')?.quantity).toBe(MAX_INT4);
      });

      it('rejects an add whose summed quantity exceeds int4 before writing or reading stock', async () => {
        db.addItem({
          id: 'item-1',
          cartId: 'cart-1',
          offerId: 'offer-1',
          quantity: MAX_INT4 - 1,
          revision: 2,
        });

        await expect(
          service.addItem(user, 'offer-1', 2, 'USD'),
        ).rejects.toThrow('Cart quantity is too large');
        expect(db.client.cartItem.upsert).not.toHaveBeenCalled();
        expect(getAllocatableStock).not.toHaveBeenCalled();
        expect(db.item('cart-1', 'offer-1')).toMatchObject({
          quantity: MAX_INT4 - 1,
          revision: 2,
        });
      });

      it('rejects setting a quantity above int4 without writing', async () => {
        db.addItem({
          id: 'item-1',
          cartId: 'cart-1',
          offerId: 'offer-1',
          quantity: 1,
        });

        await expect(
          service.updateItemQuantity(user, 'item-1', MAX_INT4 + 1, 'USD'),
        ).rejects.toThrow('Cart quantity is too large');
        expect(db.client.cartItem.update).not.toHaveBeenCalled();
      });
    });

    describe('decreases are never stock-checked', () => {
      beforeEach(() => {
        db.addItem({
          id: 'item-1',
          cartId: 'cart-1',
          offerId: 'offer-1',
          quantity: 8,
        });
        // The pool is already far short of what the cart holds.
        stock.set('variant:variant-1', [1]);
      });

      it('lets a decrease through on a short pool', async () => {
        await service.updateItemQuantity(user, 'item-1', 5, 'USD');

        expect(db.item('cart-1', 'offer-1')?.quantity).toBe(5);
        expect(getAllocatableStock).not.toHaveBeenCalled();
      });

      it('lets a same-quantity edit through on a short pool', async () => {
        await service.updateItemQuantity(user, 'item-1', 8, 'USD');

        expect(getAllocatableStock).not.toHaveBeenCalled();
      });

      it('lets a removal through on a short pool', async () => {
        await service.removeItem(user, 'item-1', 'USD');

        expect(db.linesOf('cart-1')).toEqual([]);
        expect(getAllocatableStock).not.toHaveBeenCalled();
      });

      it('still refuses an increase on that pool and leaves the line as it was', async () => {
        await expect(
          service.updateItemQuantity(user, 'item-1', 9, 'USD'),
        ).rejects.toThrow('Requested quantity exceeds available stock');

        expect(db.item('cart-1', 'offer-1')).toMatchObject({
          quantity: 8,
          revision: 0,
        });
        expect(db.rollbacks).toBe(1);
      });
    });
  });

  describe('revisions', () => {
    beforeEach(() => {
      stock.set('variant:variant-1', [1000]);
    });

    it('starts a new line at revision 0', async () => {
      await service.addItem(user, 'offer-1', 2, 'USD');

      expect(db.item('cart-1', 'offer-1')).toMatchObject({
        quantity: 2,
        revision: 0,
      });
    });

    it('increments the revision when an add tops up an existing line', async () => {
      db.addItem({
        id: 'item-1',
        cartId: 'cart-1',
        offerId: 'offer-1',
        quantity: 2,
        revision: 3,
      });

      await service.addItem(user, 'offer-1', 1, 'USD');

      expect(db.item('cart-1', 'offer-1')).toMatchObject({
        quantity: 3,
        revision: 4,
      });
    });

    it.each([
      ['an increase', 5],
      ['a decrease', 1],
      ['a same-quantity edit', 2],
    ])('increments the revision on %s', async (_label, quantity) => {
      db.addItem({
        id: 'item-1',
        cartId: 'cart-1',
        offerId: 'offer-1',
        quantity: 2,
        revision: 3,
      });

      await service.updateItemQuantity(user, 'item-1', quantity, 'USD');

      expect(db.item('cart-1', 'offer-1')).toMatchObject({
        quantity,
        revision: 4,
      });
    });

    it('makes a receipt taken before a same-quantity edit stop matching', async () => {
      db.addItem({
        id: 'item-1',
        cartId: 'cart-1',
        offerId: 'offer-1',
        quantity: 2,
        revision: 3,
      });
      const [receipt] = await service.getCheckoutSnapshot('user-1', ['item-1']);

      await service.updateItemQuantity(user, 'item-1', 2, 'USD');

      await expect(
        service.lockAndVerifyCheckoutSnapshot(
          db.client as unknown as Prisma.TransactionClient,
          'user-1',
          [receipt!],
        ),
      ).rejects.toThrow('Cart changed; review your cart and check out again');
    });

    it('does not move the revision of a rejected increase', async () => {
      stock.set('variant:variant-1', [2]);
      db.addItem({
        id: 'item-1',
        cartId: 'cart-1',
        offerId: 'offer-1',
        quantity: 2,
        revision: 3,
      });

      await expect(service.addItem(user, 'offer-1', 1, 'USD')).rejects.toThrow(
        ConflictException,
      );

      expect(db.item('cart-1', 'offer-1')).toMatchObject({
        quantity: 2,
        revision: 3,
      });
    });
  });

  describe('mergeGuestCart', () => {
    beforeEach(() => {
      db.addCart({ id: 'guest-cart', guestToken: 'guest-token' });
      db.addItem({
        id: 'user-line-1',
        cartId: 'cart-1',
        offerId: 'offer-1',
        quantity: 2,
        revision: 5,
      });
      db.addItem({
        id: 'user-line-3',
        cartId: 'cart-1',
        offerId: 'offer-3',
        quantity: 1,
        revision: 7,
      });
      db.addItem({
        id: 'guest-line-1',
        cartId: 'guest-cart',
        offerId: 'offer-1',
        quantity: 3,
      });
      db.addItem({
        id: 'guest-line-2',
        cartId: 'guest-cart',
        offerId: 'offer-2',
        quantity: 4,
      });
      offers.set(
        'offer-3',
        buildOffer('offer-3', {
          sellerId: 'seller-1',
          stockSource: OfferStockSource.SELLER,
        }),
      );
      stock.set('offer:offer-3', [1]);
    });

    it('sums quantities, bumps revisions only of touched lines and consumes the guest cart', async () => {
      stock.set('variant:variant-1', [9]);

      await service.mergeGuestCart('user-1', 'guest-token', 'USD');

      expect(db.locks).toEqual(['carts:cart-1', 'carts:guest-cart']);
      expect(db.item('cart-1', 'offer-1')).toMatchObject({
        quantity: 5,
        revision: 6,
      });
      expect(db.item('cart-1', 'offer-2')).toMatchObject({
        quantity: 4,
        revision: 0,
      });
      // Not in the guest cart: neither its quantity nor its revision moves.
      expect(db.item('cart-1', 'offer-3')).toMatchObject({
        quantity: 1,
        revision: 7,
      });
      expect(db.carts.find((cart) => cart.id === 'guest-cart')?.status).toBe(
        CartStatus.MERGED,
      );
      // Only the pool the merge added to is checked.
      expect(getAllocatableStock).toHaveBeenCalledWith(
        [{ kind: 'variant', variantId: 'variant-1' }],
        db.client,
      );
    });

    it('changes neither cart when any resulting line exceeds stock', async () => {
      // offer-1 (5) and offer-2 (4) share the variant pool: 9 wanted, 8 there.
      stock.set('variant:variant-1', [8]);
      const before = structuredClone({ carts: db.carts, items: db.items });

      await expect(
        service.mergeGuestCart('user-1', 'guest-token', 'USD'),
      ).rejects.toThrow('Requested quantity exceeds available stock');

      expect(db.carts).toEqual(before.carts);
      expect(db.items).toEqual(before.items);
    });

    it('leaves the guest cart mergeable after a refused merge', async () => {
      stock.set('variant:variant-1', [8]);
      await expect(
        service.mergeGuestCart('user-1', 'guest-token', 'USD'),
      ).rejects.toThrow(ConflictException);

      stock.set('variant:variant-1', [9]);
      await service.mergeGuestCart('user-1', 'guest-token', 'USD');

      expect(db.linesOf('cart-1')).toEqual([
        { offerId: 'offer-1', quantity: 5 },
        { offerId: 'offer-2', quantity: 4 },
        { offerId: 'offer-3', quantity: 1 },
      ]);
    });

    it('rejects an overflowing merge before writing anything', async () => {
      db.item('cart-1', 'offer-1')!.quantity = MAX_INT4 - 1;
      const before = structuredClone({ carts: db.carts, items: db.items });

      await expect(
        service.mergeGuestCart('user-1', 'guest-token', 'USD'),
      ).rejects.toThrow('Cart quantity is too large');

      expect(db.client.cartItem.upsert).not.toHaveBeenCalled();
      expect(getAllocatableStock).not.toHaveBeenCalled();
      expect(db.carts).toEqual(before.carts);
      expect(db.items).toEqual(before.items);
    });

    it('consumes a guest cart only once', async () => {
      stock.set('variant:variant-1', [100]);

      await service.mergeGuestCart('user-1', 'guest-token', 'USD');
      await service.mergeGuestCart('user-1', 'guest-token', 'USD');

      expect(db.item('cart-1', 'offer-1')).toMatchObject({
        quantity: 5,
        revision: 6,
      });
    });

    it('is a no-op when the guest cart was merged between the read and the lock', async () => {
      stock.set('variant:variant-1', [100]);
      // The unlocked lookup still sees ACTIVE; the locked reread does not.
      const original = db.client.cart.findUnique.getMockImplementation()!;
      db.client.cart.findUnique.mockImplementationOnce((args) => {
        const result = original(args);
        db.carts.find((cart) => cart.id === 'guest-cart')!.status =
          CartStatus.MERGED;
        return result;
      });

      await service.mergeGuestCart('user-1', 'guest-token', 'USD');

      expect(db.client.cartItem.upsert).not.toHaveBeenCalled();
      expect(db.item('cart-1', 'offer-1')?.quantity).toBe(2);
    });

    it('refuses with 409 and changes nothing when the user cart is no longer active', async () => {
      stock.set('variant:variant-1', [100]);
      // findCart resolves the active cart; it is retired before the lock.
      const original = db.client.cart.findFirst.getMockImplementation()!;
      db.client.cart.findFirst.mockImplementationOnce((args) => {
        const result = original(args);
        db.carts.find((cart) => cart.id === 'cart-1')!.status =
          CartStatus.MERGED;
        return result;
      });

      await expect(
        service.mergeGuestCart('user-1', 'guest-token', 'USD'),
      ).rejects.toThrow('Cart is no longer active');

      expect(db.carts.find((cart) => cart.id === 'guest-cart')?.status).toBe(
        CartStatus.ACTIVE,
      );
      expect(db.item('cart-1', 'offer-1')?.quantity).toBe(2);
    });
  });

  describe('cleanUpCheckout', () => {
    beforeEach(() => {
      db.addItem({
        id: 'item-1',
        cartId: 'cart-1',
        offerId: 'offer-1',
        quantity: 2,
        revision: 3,
      });
      db.addItem({
        id: 'item-2',
        cartId: 'cart-1',
        offerId: 'offer-2',
        quantity: 1,
        revision: 0,
      });
      db.addItem({
        id: 'item-3',
        cartId: 'cart-1',
        offerId: 'offer-3',
        quantity: 4,
        revision: 1,
      });
    });

    const fullReceipt = [
      { id: 'item-1', offerId: 'offer-1', quantity: 2, revision: 3 },
      { id: 'item-2', offerId: 'offer-2', quantity: 1, revision: 0 },
    ];

    function placeOrder(order: Partial<OrderRow>): void {
      db.orders.push({
        id: 'order-1',
        userId: 'user-1',
        status: OrderStatus.PENDING_PAYMENT,
        checkoutCartSnapshot: fullReceipt,
        payment: null,
        ...order,
      });
    }

    const remainingIds = (): string[] =>
      db.items
        .filter((row) => row.cartId === 'cart-1')
        .map((row) => row.id)
        .sort();

    it('returns without touching the cart when the order no longer exists', async () => {
      await expect(
        service.cleanUpCheckout('user-1', 'order-1'),
      ).resolves.toBeUndefined();
      expect(remainingIds()).toEqual(['item-1', 'item-2', 'item-3']);
    });

    it('ignores an order that belongs to someone else', async () => {
      placeOrder({
        userId: 'user-2',
        payment: { status: PaymentStatus.SUCCEEDED, providerReference: 'r' },
      });

      await service.cleanUpCheckout('user-1', 'order-1');

      expect(remainingIds()).toEqual(['item-1', 'item-2', 'item-3']);
    });

    it('throws for a retry while a pending order has no payment yet', async () => {
      placeOrder({ status: OrderStatus.PENDING_PAYMENT, payment: null });

      await expect(
        service.cleanUpCheckout('user-1', 'order-1'),
      ).rejects.toThrow('Payment for order order-1 is not yet recorded');
      expect(remainingIds()).toEqual(['item-1', 'item-2', 'item-3']);
    });

    it.each([OrderStatus.CANCELLED, OrderStatus.PAID])(
      'keeps the cart without retrying when a %s order has no payment',
      async (status) => {
        placeOrder({ status, payment: null });

        await expect(
          service.cleanUpCheckout('user-1', 'order-1'),
        ).resolves.toBeUndefined();
        expect(remainingIds()).toEqual(['item-1', 'item-2', 'item-3']);
      },
    );

    it.each([
      [PaymentStatus.FAILED, 'ref-1'],
      [PaymentStatus.FAILED, null],
      [PaymentStatus.CANCELLED, 'ref-1'],
      [PaymentStatus.CANCELLED, null],
    ])(
      'keeps the cart without retrying when the payment is %s (reference %s)',
      async (status, providerReference) => {
        placeOrder({
          status: OrderStatus.CANCELLED,
          payment: { status, providerReference },
        });

        await expect(
          service.cleanUpCheckout('user-1', 'order-1'),
        ).resolves.toBeUndefined();
        expect(remainingIds()).toEqual(['item-1', 'item-2', 'item-3']);
      },
    );

    it.each([
      PaymentStatus.PENDING,
      PaymentStatus.REQUIRES_ACTION,
      PaymentStatus.PROCESSING,
    ])(
      'throws for a retry while a %s payment was never submitted (no provider reference)',
      async (status) => {
        placeOrder({ payment: { status, providerReference: null } });

        await expect(
          service.cleanUpCheckout('user-1', 'order-1'),
        ).rejects.toThrow('awaits reconciliation before cart cleanup');
        expect(remainingIds()).toEqual(['item-1', 'item-2', 'item-3']);
      },
    );

    it.each([
      [PaymentStatus.PENDING, 'ref-1'],
      [PaymentStatus.REQUIRES_ACTION, 'ref-1'],
      [PaymentStatus.PROCESSING, 'ref-1'],
      [PaymentStatus.SUCCEEDED, 'ref-1'],
      [PaymentStatus.SUCCEEDED, null],
    ])(
      'removes the receipt lines once a %s payment (reference %s) was accepted',
      async (status, providerReference) => {
        placeOrder({ payment: { status, providerReference } });

        await service.cleanUpCheckout('user-1', 'order-1');

        expect(remainingIds()).toEqual(['item-3']);
        expect(db.locks).toEqual(['carts:cart-1']);
      },
    );

    it('keeps lines edited or re-added since the checkout', async () => {
      placeOrder({
        payment: { status: PaymentStatus.SUCCEEDED, providerReference: 'r' },
      });
      // Same quantity, but edited since: the revision moved.
      db.items.find((row) => row.id === 'item-1')!.revision = 4;
      // Quantity changed.
      db.items.find((row) => row.id === 'item-2')!.quantity = 5;

      await service.cleanUpCheckout('user-1', 'order-1');

      expect(remainingIds()).toEqual(['item-1', 'item-2', 'item-3']);
    });

    it('is idempotent', async () => {
      placeOrder({
        payment: { status: PaymentStatus.SUCCEEDED, providerReference: 'r' },
      });

      await service.cleanUpCheckout('user-1', 'order-1');
      await service.cleanUpCheckout('user-1', 'order-1');

      expect(remainingIds()).toEqual(['item-3']);
    });

    it('returns quietly when the user no longer has a cart', async () => {
      placeOrder({
        payment: { status: PaymentStatus.SUCCEEDED, providerReference: 'r' },
      });
      db.carts = db.carts.filter((cart) => cart.id !== 'cart-1');

      await expect(
        service.cleanUpCheckout('user-1', 'order-1'),
      ).resolves.toBeUndefined();
      expect(db.client.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    describe('legacy snapshots', () => {
      it.each([
        ['no snapshot', null],
        ['an object snapshot', { 'item-1': 2 }],
        ['a string snapshot', 'item-1'],
        ['an empty array', []],
        ['only malformed entries', [{ id: 'item-1' }, 'item-2', null, 7]],
      ])(
        'deletes nothing for an order with %s',
        async (_label, checkoutCartSnapshot) => {
          placeOrder({
            checkoutCartSnapshot: checkoutCartSnapshot as Prisma.JsonValue,
            payment: {
              status: PaymentStatus.SUCCEEDED,
              providerReference: 'r',
            },
          });

          await expect(
            service.cleanUpCheckout('user-1', 'order-1'),
          ).resolves.toBeUndefined();
          expect(remainingIds()).toEqual(['item-1', 'item-2', 'item-3']);
          expect(db.client.cartItem.deleteMany).not.toHaveBeenCalled();
        },
      );

      it('removes the lines of a first-draft receipt that carries no offerId', async () => {
        placeOrder({
          checkoutCartSnapshot: [
            { id: 'item-1', quantity: 2, revision: 3 },
            { id: 'item-2', quantity: 1, revision: 0 },
          ],
          payment: { status: PaymentStatus.SUCCEEDED, providerReference: 'r' },
        });

        await service.cleanUpCheckout('user-1', 'order-1');

        expect(remainingIds()).toEqual(['item-3']);
      });

      it('uses the well-formed entries of a partly malformed receipt', async () => {
        placeOrder({
          checkoutCartSnapshot: [
            { id: 'item-1', quantity: 2, revision: 3 },
            { id: 'item-2', quantity: '1', revision: 0 },
            { id: 'item-3', quantity: 4 },
          ],
          payment: { status: PaymentStatus.SUCCEEDED, providerReference: 'r' },
        });

        await service.cleanUpCheckout('user-1', 'order-1');

        expect(remainingIds()).toEqual(['item-2', 'item-3']);
      });
    });
  });
});
