import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import {
  INestApplication,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import { PrismaClient, Role } from '@prisma/client';
import request, { type Response } from 'supertest';

import { AppModule } from '../src/app.module';
import { ValidationException } from '../src/common/http/validation-exception';
import { PrismaService } from '../src/database/prisma.service';
import { CartService } from '../src/modules/cart/cart.service';
import { MAX_INT4 } from '../src/modules/inventory/stock-allocation';
import { PAYMENT_PROVIDER } from '../src/modules/payments/payment-provider';
import { FakePaymentProvider } from './support/fake-payment-provider';

type Customer = {
  userId: string;
  addressId: string;
  headers: { Authorization: string };
};

/** One platform stock pool: a variant, its offers and its warehouse records. */
type Pool = {
  variantId: string;
  /** First-party PLATFORM offers on the variant, in ascending id. */
  offerIds: string[];
  /** The pool's inventory records, in ascending id (allocation order). */
  recordIds: string[];
};

type Line = { offerId: string; quantity: number; revision: number };

type ErrorBody = {
  error: { message: string; details: { field?: string; message: string }[] };
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
};

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function errorOf(response: Response): ErrorBody['error'] {
  return (response.body as ErrorBody).error;
}

/**
 * Cart concurrency against a real, migrated Postgres database. Interleavings
 * are forced with row locks held by a separately controlled transaction: the
 * competing requests are started, the test waits until Postgres reports each
 * of them blocked on a lock, and only then releases. Nothing here relies on
 * timing.
 */
describe('Cart concurrency (integration, real Postgres)', () => {
  const label = 'cart-int';
  let app: INestApplication;
  let prisma: PrismaService;
  let cartService: CartService;
  // A separate client (and connection pool) that holds the row locks and
  // watches pg_stat_activity, so it never competes with the app for a
  // connection.
  let locker: PrismaClient;
  let jwt: JwtService;
  const userIds: string[] = [];
  const productIds: string[] = [];
  const offerIds: string[] = [];
  const warehouseIds: string[] = [];
  const guestTokens: string[] = [];

  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(new FakePaymentProvider())
      // Every request comes from one address; the per-IP rate limit is not
      // what these specs exercise.
      .overrideProvider(getStorageToken())
      .useValue({
        increment: () =>
          Promise.resolve({
            totalHits: 1,
            timeToExpire: 60,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
        exceptionFactory: (errors: ValidationError[]): ValidationException =>
          new ValidationException(errors),
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    cartService = app.get(CartService);
    jwt = app.get(JwtService);
    locker = new PrismaClient();
    await locker.$connect();
  });

  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, payment: { select: { id: true } } },
    });
    const orderIds = orders.map((order) => order.id);
    const paymentIds = orders.flatMap((order) =>
      order.payment ? [order.payment.id] : [],
    );
    const reservations = await prisma.reservation.findMany({
      where: { inventoryRecord: { warehouseId: { in: warehouseIds } } },
      select: { id: true },
    });
    const jobKeys = [
      ...orderIds.map((id) => ['orderId', id] as const),
      ...paymentIds.map((id) => ['paymentId', id] as const),
      ...reservations.map((row) => ['reservationId', row.id] as const),
    ];
    for (const [key, id] of jobKeys) {
      await prisma.backgroundJob.deleteMany({
        where: { payload: { path: [key], equals: id } },
      });
    }
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...orderIds, ...paymentIds] } },
    });
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.cart.deleteMany({
      where: { guestToken: { in: guestTokens } },
    });
    // Orders, carts, checkout attempts and addresses cascade from the user.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.reservation.deleteMany({
      where: { inventoryRecord: { warehouseId: { in: warehouseIds } } },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { inventoryRecord: { warehouseId: { in: warehouseIds } } },
    });
    await prisma.inventoryRecord.deleteMany({
      where: { warehouseId: { in: warehouseIds } },
    });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    await prisma.offer.deleteMany({ where: { id: { in: offerIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await locker.$disconnect();
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function createCustomer(): Promise<Customer> {
    const suffix = randomUUID().slice(0, 8);
    const user = await prisma.user.create({
      data: {
        email: `${label}-buyer-${suffix}@example.test`,
        passwordHash: 'x',
        role: Role.CUSTOMER,
      },
    });
    userIds.push(user.id);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: `${label}:${randomUUID()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const token = await jwt.signAsync({
      sub: user.id,
      role: Role.CUSTOMER,
      sid: session.id,
    });
    const headers = { Authorization: `Bearer ${token}` };
    const address = await request(server())
      .post('/api/v1/users/me/addresses')
      .set(headers)
      .send({
        recipientName: 'Integration Buyer',
        line1: '1 Cairo Road',
        city: 'Lusaka',
        postalCode: '10101',
        country: 'ZM',
      })
      .expect(201);
    return {
      userId: user.id,
      addressId: (address.body as { data: { id: string } }).data.id,
      headers,
    };
  }

  /**
   * A published variant with `offerCount` first-party offers (PLATFORM stock,
   * priced in ZMW) sharing one pool, stocked by one record per entry of
   * `onHand`. Records are assigned their stock in ascending id order, so
   * `onHand[0]` is what first-fit allocation tries first.
   */
  async function createPool(onHand: number[], offerCount = 1): Promise<Pool> {
    const suffix = randomUUID().slice(0, 8);
    const product = await prisma.product.create({
      data: {
        name: `${label} product ${suffix}`,
        slug: `${label}-product-${suffix}`,
        status: 'PUBLISHED',
      },
    });
    productIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        skuCode: `${label.toUpperCase()}-${suffix}`,
        status: 'PUBLISHED',
      },
    });
    const offers: string[] = [];
    for (let index = 0; index < offerCount; index += 1) {
      const offer = await prisma.offer.create({
        data: { variantId: variant.id, status: 'PUBLISHED' },
      });
      offerIds.push(offer.id);
      offers.push(offer.id);
      await prisma.price.create({
        data: { offerId: offer.id, amount: 1_000, currency: 'ZMW' },
      });
    }
    const records: string[] = [];
    for (let index = 0; index < onHand.length; index += 1) {
      const warehouse = await prisma.warehouse.create({
        data: {
          name: `${label} warehouse ${suffix}-${index}`,
          code: `${label}-${suffix}-${index}`,
        },
      });
      warehouseIds.push(warehouse.id);
      const record = await prisma.inventoryRecord.create({
        data: { warehouseId: warehouse.id, variantId: variant.id, onHand: 0 },
      });
      records.push(record.id);
    }
    records.sort();
    for (const [index, id] of records.entries()) {
      await prisma.inventoryRecord.update({
        where: { id },
        data: { onHand: onHand[index] },
      });
    }
    return {
      variantId: variant.id,
      offerIds: offers.sort(),
      recordIds: records,
    };
  }

  function addItem(
    customer: Customer,
    offerId: string,
    quantity: number,
  ): request.Test {
    return request(server())
      .post('/api/v1/cart/items?currency=ZMW')
      .set(customer.headers)
      .send({ offerId, quantity });
  }

  /** Adds to a guest cart, creating one (and its token) when none is given. */
  async function addGuestItem(
    offerId: string,
    quantity: number,
    guestToken?: string,
  ): Promise<string> {
    const call = request(server()).post('/api/v1/cart/items?currency=ZMW');
    if (guestToken) call.set('x-guest-token', guestToken);
    const response = await call.send({ offerId, quantity }).expect(201);
    const token =
      guestToken ??
      (response.body as { data: { guestToken: string } }).data.guestToken;
    if (!guestToken) guestTokens.push(token);
    return token;
  }

  function merge(customer: Customer, guestToken: string): request.Test {
    return request(server())
      .post('/api/v1/cart/merge?currency=ZMW')
      .set(customer.headers)
      .set('x-guest-token', guestToken);
  }

  function updateItem(
    customer: Customer,
    itemId: string,
    quantity: number,
  ): request.Test {
    return request(server())
      .patch(`/api/v1/cart/items/${itemId}?currency=ZMW`)
      .set(customer.headers)
      .send({ quantity });
  }

  function checkout(customer: Customer): request.Test {
    return request(server())
      .post('/api/v1/checkout')
      .set(customer.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ shippingAddressId: customer.addressId, currency: 'ZMW' });
  }

  async function userCartId(userId: string): Promise<string> {
    return (
      await prisma.cart.findUniqueOrThrow({
        where: { userId },
        select: { id: true },
      })
    ).id;
  }

  async function guestCart(
    guestToken: string,
  ): Promise<{ id: string; status: string }> {
    return prisma.cart.findUniqueOrThrow({
      where: { guestToken },
      select: { id: true, status: true },
    });
  }

  /** The persisted lines of a cart, by offer id. */
  async function linesOf(cartId: string): Promise<Line[]> {
    return prisma.cartItem.findMany({
      where: { cartId },
      select: { offerId: true, quantity: true, revision: true },
      orderBy: { offerId: 'asc' },
    });
  }

  /** Every column of a cart's lines, to prove nothing at all was written. */
  function rawLinesOf(cartId: string): Promise<unknown[]> {
    return prisma.cartItem.findMany({
      where: { cartId },
      orderBy: { id: 'asc' },
    });
  }

  async function userLines(userId: string): Promise<Line[]> {
    const cart = await prisma.cart.findUnique({
      where: { userId },
      select: { id: true },
    });
    return cart ? linesOf(cart.id) : [];
  }

  /**
   * Holds `SELECT ... FOR UPDATE` on one row in a transaction of its own until
   * the returned release function is called.
   */
  async function holdRowLock(
    table: 'users' | 'carts',
    id: string,
  ): Promise<() => Promise<void>> {
    const acquired = deferred();
    const release = deferred();
    const finished = locker.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT id FROM ${table} WHERE id = $1::uuid FOR UPDATE`,
          id,
        );
        acquired.resolve();
        await release.promise;
      },
      // The test's own lock holder, not application code: it must outlive
      // the wait for the competing requests to block.
      { maxWait: 5_000, timeout: 30_000 },
    );
    await Promise.race([acquired.promise, finished]);
    return async () => {
      release.resolve();
      await finished;
    };
  }

  /** Condition-polls Postgres until `count` backends wait on a lock. */
  async function waitForLockWaiters(count: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const [row] = await locker.$queryRaw<{ waiting: number }[]>`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if ((row?.waiting ?? 0) >= count) return;
      if (Date.now() > deadline) {
        throw new Error(
          `Expected ${count} backends blocked on a lock, saw ${row?.waiting ?? 0}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /** Starts every request now (a supertest request runs once awaited). */
  function start(calls: request.Test[]): Promise<Response[]> {
    return Promise.all(calls.map((call) => call.then((response) => response)));
  }

  /**
   * Pauses the next checkout after it read its cart snapshot and before the
   * order transaction starts.
   */
  function pauseCheckoutAfterSnapshot(): {
    reached: Promise<void>;
    release(): void;
  } {
    const reached = deferred();
    const release = deferred();
    const original = cartService.getCheckoutSnapshot.bind(cartService);
    jest
      .spyOn(cartService, 'getCheckoutSnapshot')
      .mockImplementationOnce(async (...args) => {
        const rows = await original(...args);
        reached.resolve();
        await release.promise;
        return rows;
      });
    return { reached: reached.promise, release: () => release.resolve() };
  }

  async function stockOf(
    recordId: string,
  ): Promise<{ onHand: number; reserved: number }> {
    return prisma.inventoryRecord.findUniqueOrThrow({
      where: { id: recordId },
      select: { onHand: true, reserved: true },
    });
  }

  async function expectNoOrder(customer: Customer, pool: Pool): Promise<void> {
    expect(
      await prisma.order.count({ where: { userId: customer.userId } }),
    ).toBe(0);
    expect(
      await prisma.reservation.count({
        where: { inventoryRecordId: { in: pool.recordIds } },
      }),
    ).toBe(0);
    for (const id of pool.recordIds) {
      expect((await stockOf(id)).reserved).toBe(0);
    }
    // The cart-cleanup job is enqueued inside the order transaction, so a
    // rolled-back checkout leaves none behind.
    expect(
      await prisma.backgroundJob.count({
        where: { payload: { path: ['userId'], equals: customer.userId } },
      }),
    ).toBe(0);
  }

  function expectStockConflict(
    response: Response,
    offerId: string,
    available: number,
  ): void {
    expect(response.status).toBe(409);
    expect(errorOf(response)).toMatchObject({
      message: 'Requested quantity exceeds available stock',
      details: [
        { field: 'offerId', message: offerId },
        { field: 'available', message: String(available) },
      ],
    });
  }

  describe('cart creation and adds', () => {
    it('creates exactly one cart when a user’s first adds race, keeping every line and quantity', async () => {
      const customer = await createCustomer();
      const pool = await createPool([100], 2);
      const [a, b] = pool.offerIds as [string, string];

      // Every add finds no cart and queues on the users row.
      const release = await holdRowLock('users', customer.userId);
      const pending = start([
        addItem(customer, a, 1),
        addItem(customer, a, 2),
        addItem(customer, a, 3),
        addItem(customer, b, 4),
        addItem(customer, b, 5),
      ]);
      await waitForLockWaiters(5);
      await release();
      const responses = await pending;

      expect(responses.map((response) => response.status)).toEqual([
        201, 201, 201, 201, 201,
      ]);
      expect(
        await prisma.cart.count({ where: { userId: customer.userId } }),
      ).toBe(1);
      // One add created each line; every later add moved its revision once.
      expect(await userLines(customer.userId)).toEqual(
        [
          { offerId: a, quantity: 6, revision: 2 },
          { offerId: b, quantity: 9, revision: 1 },
        ].sort((left, right) => left.offerId.localeCompare(right.offerId)),
      );
    });

    it('sums concurrent adds of the same offer exactly, moving the revision once per add', async () => {
      const customer = await createCustomer();
      const pool = await createPool([100]);
      const [offer] = pool.offerIds as [string];
      await addItem(customer, offer, 1).expect(201);
      const cartId = await userCartId(customer.userId);

      const release = await holdRowLock('carts', cartId);
      const pending = start(
        [1, 2, 3, 4, 5].map((quantity) => addItem(customer, offer, quantity)),
      );
      await waitForLockWaiters(5);
      await release();
      const responses = await pending;

      expect(responses.map((response) => response.status)).toEqual([
        201, 201, 201, 201, 201,
      ]);
      expect(await linesOf(cartId)).toEqual([
        { offerId: offer, quantity: 16, revision: 5 },
      ]);
    });

    it('lets concurrent adds through only while stock allows, rejecting the rest whole', async () => {
      const customer = await createCustomer();
      const pool = await createPool([10]);
      const [offer] = pool.offerIds as [string];
      await addItem(customer, offer, 1).expect(201);
      const cartId = await userCartId(customer.userId);

      const release = await holdRowLock('carts', cartId);
      const pending = start(
        [1, 2, 3, 4, 5].map(() => addItem(customer, offer, 3)),
      );
      await waitForLockWaiters(5);
      await release();
      const responses = await pending;

      // Serialized on the cart row, each add sees the previous ones: three
      // fit (1 + 3 × 3 = 10), the other two are refused.
      expect(
        responses.map((response) => response.status).sort((x, y) => x - y),
      ).toEqual([201, 201, 201, 409, 409]);
      for (const response of responses.filter((r) => r.status === 409)) {
        expectStockConflict(response, offer, 10);
      }
      expect(await linesOf(cartId)).toEqual([
        { offerId: offer, quantity: 10, revision: 3 },
      ]);
    });

    it('rejects an add or increase over stock with 409 naming the offer and what is available', async () => {
      const customer = await createCustomer();
      const pool = await createPool([5]);
      const [offer] = pool.offerIds as [string];

      expectStockConflict(await addItem(customer, offer, 6), offer, 5);
      expect(await userLines(customer.userId)).toEqual([]);

      await addItem(customer, offer, 3).expect(201);
      expectStockConflict(await addItem(customer, offer, 3), offer, 5);
      const cartId = await userCartId(customer.userId);
      const item = await prisma.cartItem.findFirstOrThrow({
        where: { cartId },
      });
      expectStockConflict(await updateItem(customer, item.id, 6), offer, 5);

      expect(await linesOf(cartId)).toEqual([
        { offerId: offer, quantity: 3, revision: 0 },
      ]);
    });

    it('refuses quantities beyond the int4 range with 409 and changes nothing', async () => {
      const customer = await createCustomer();
      const pool = await createPool([10]);
      const [offer] = pool.offerIds as [string];

      const tooLarge = await addItem(customer, offer, MAX_INT4 + 1);
      expect(tooLarge.status).toBe(409);
      expect(errorOf(tooLarge).message).toBe('Cart quantity is too large');
      expect(await userLines(customer.userId)).toEqual([]);

      await addItem(customer, offer, 2).expect(201);
      const cartId = await userCartId(customer.userId);
      const overflow = await addItem(customer, offer, MAX_INT4 - 1);
      expect(overflow.status).toBe(409);
      expect(errorOf(overflow).message).toBe('Cart quantity is too large');

      const item = await prisma.cartItem.findFirstOrThrow({
        where: { cartId },
      });
      const patched = await updateItem(customer, item.id, MAX_INT4 + 1);
      expect(patched.status).toBe(409);
      expect(errorOf(patched).message).toBe('Cart quantity is too large');
      expect(await linesOf(cartId)).toEqual([
        { offerId: offer, quantity: 2, revision: 0 },
      ]);

      // A merge whose sum overflows is refused whole as well.
      const guestToken = await addGuestItem(offer, 1);
      const guest = await guestCart(guestToken);
      await prisma.cartItem.updateMany({
        where: { cartId: guest.id },
        data: { quantity: MAX_INT4 },
      });
      const userBefore = await rawLinesOf(cartId);
      const guestBefore = await rawLinesOf(guest.id);
      const merged = await merge(customer, guestToken);
      expect(merged.status).toBe(409);
      expect(errorOf(merged).message).toBe('Cart quantity is too large');
      expect(await rawLinesOf(cartId)).toEqual(userBefore);
      expect(await rawLinesOf(guest.id)).toEqual(guestBefore);
      expect((await guestCart(guestToken)).status).toBe('ACTIVE');
    });

    it('allows decreasing a line that is already above stock, but not increasing it', async () => {
      const customer = await createCustomer();
      const pool = await createPool([5]);
      const [offer] = pool.offerIds as [string];
      const [record] = pool.recordIds as [string];
      await addItem(customer, offer, 5).expect(201);
      const cartId = await userCartId(customer.userId);
      const item = await prisma.cartItem.findFirstOrThrow({
        where: { cartId },
      });
      // Stock falls under the cart's quantity after it was accepted.
      await prisma.inventoryRecord.update({
        where: { id: record },
        data: { onHand: 2 },
      });

      await updateItem(customer, item.id, 3).expect(200);
      await updateItem(customer, item.id, 3).expect(200);
      expect(await linesOf(cartId)).toEqual([
        { offerId: offer, quantity: 3, revision: 2 },
      ]);

      expectStockConflict(await updateItem(customer, item.id, 4), offer, 2);
      expect(await linesOf(cartId)).toEqual([
        { offerId: offer, quantity: 3, revision: 2 },
      ]);

      await request(server())
        .delete(`/api/v1/cart/items/${item.id}?currency=ZMW`)
        .set(customer.headers)
        .expect(200);
      expect(await linesOf(cartId)).toEqual([]);
    });
  });

  describe('guest merge', () => {
    it('consumes a guest cart exactly once when the same user merges it twice concurrently', async () => {
      const customer = await createCustomer();
      const pool = await createPool([100], 2);
      const [a, b] = pool.offerIds as [string, string];
      const guestToken = await addGuestItem(a, 2);
      await addGuestItem(b, 1, guestToken);
      await addItem(customer, a, 1).expect(201);
      const guest = await guestCart(guestToken);

      const release = await holdRowLock('carts', guest.id);
      const pending = start([
        merge(customer, guestToken),
        merge(customer, guestToken),
      ]);
      await waitForLockWaiters(2);
      await release();
      const responses = await pending;

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect((await guestCart(guestToken)).status).toBe('MERGED');
      expect(await userLines(customer.userId)).toEqual(
        [
          { offerId: a, quantity: 3, revision: 1 },
          { offerId: b, quantity: 1, revision: 0 },
        ].sort((left, right) => left.offerId.localeCompare(right.offerId)),
      );
    });

    it('gives a guest cart to exactly one of two users merging it concurrently', async () => {
      const first = await createCustomer();
      const second = await createCustomer();
      const pool = await createPool([100], 2);
      const [a, b] = pool.offerIds as [string, string];
      const guestToken = await addGuestItem(a, 2);
      await addGuestItem(b, 1, guestToken);
      // The first user already has a cart; the second gets one in the merge.
      await addItem(first, a, 1).expect(201);
      const guest = await guestCart(guestToken);

      const release = await holdRowLock('carts', guest.id);
      const pending = start([
        merge(first, guestToken),
        merge(second, guestToken),
      ]);
      await waitForLockWaiters(2);
      await release();
      const responses = await pending;

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect((await guestCart(guestToken)).status).toBe('MERGED');
      const firstLines = await userLines(first.userId);
      const secondLines = await userLines(second.userId);
      const sorted = (lines: Line[]): Line[] =>
        lines.sort((left, right) => left.offerId.localeCompare(right.offerId));
      const firstWon = firstLines.some((line) => line.offerId === b);
      if (firstWon) {
        expect(firstLines).toEqual(
          sorted([
            { offerId: a, quantity: 3, revision: 1 },
            { offerId: b, quantity: 1, revision: 0 },
          ]),
        );
        expect(secondLines).toEqual([]);
      } else {
        expect(firstLines).toEqual([{ offerId: a, quantity: 1, revision: 0 }]);
        expect(secondLines).toEqual(
          sorted([
            { offerId: a, quantity: 2, revision: 0 },
            { offerId: b, quantity: 1, revision: 0 },
          ]),
        );
      }
    });

    it('serializes a merge with a concurrent add on the user cart, applying both', async () => {
      const customer = await createCustomer();
      const pool = await createPool([100]);
      const [offer] = pool.offerIds as [string];
      await addItem(customer, offer, 1).expect(201);
      const guestToken = await addGuestItem(offer, 2);
      const cartId = await userCartId(customer.userId);

      const release = await holdRowLock('carts', cartId);
      const pending = start([
        merge(customer, guestToken),
        addItem(customer, offer, 2),
      ]);
      await waitForLockWaiters(2);
      await release();
      const responses = await pending;

      expect(responses.map((response) => response.status)).toEqual([200, 201]);
      expect((await guestCart(guestToken)).status).toBe('MERGED');
      // Neither lost the other's write; each moved the revision once.
      expect(await linesOf(cartId)).toEqual([
        { offerId: offer, quantity: 5, revision: 2 },
      ]);
    });

    it('serializes a merge with a concurrent add when only one of them fits in stock', async () => {
      const customer = await createCustomer();
      const pool = await createPool([4]);
      const [offer] = pool.offerIds as [string];
      await addItem(customer, offer, 1).expect(201);
      const guestToken = await addGuestItem(offer, 2);
      const guest = await guestCart(guestToken);
      const cartId = await userCartId(customer.userId);

      const release = await holdRowLock('carts', cartId);
      const pending = start([
        merge(customer, guestToken),
        addItem(customer, offer, 2),
      ]);
      await waitForLockWaiters(2);
      await release();
      const [merged, added] = (await pending) as [Response, Response];

      // Either alone fits (1 + 2 = 3 ≤ 4); both together (5) do not. Whichever
      // runs second sees the first and is refused.
      expect([merged.status, added.status].sort((x, y) => x - y)).toEqual(
        merged.status === 409 ? [201, 409] : [200, 409],
      );
      expectStockConflict(merged.status === 409 ? merged : added, offer, 4);
      expect(await linesOf(cartId)).toEqual([
        { offerId: offer, quantity: 3, revision: 1 },
      ]);
      const after = await guestCart(guestToken);
      if (merged.status === 409) {
        expect(after.status).toBe('ACTIVE');
        expect(await linesOf(guest.id)).toEqual([
          { offerId: offer, quantity: 2, revision: 0 },
        ]);
      } else {
        expect(after.status).toBe('MERGED');
      }
    });

    it('refuses a merge that would exceed stock as a whole, changing neither cart', async () => {
      const customer = await createCustomer();
      const short = await createPool([5]);
      const plenty = await createPool([10]);
      const [a] = short.offerIds as [string];
      const [b] = plenty.offerIds as [string];
      await addItem(customer, a, 3).expect(201);
      // The guest's own lines fit; only the combined quantity of `a` does not.
      const guestToken = await addGuestItem(a, 3);
      await addGuestItem(b, 1, guestToken);
      const cartId = await userCartId(customer.userId);
      const guest = await guestCart(guestToken);
      const userBefore = await rawLinesOf(cartId);
      const guestBefore = await rawLinesOf(guest.id);

      expectStockConflict(await merge(customer, guestToken), a, 5);

      // Rows, quantities, revisions and timestamps are all untouched: no
      // partial upsert of `b` survived.
      expect(await rawLinesOf(cartId)).toEqual(userBefore);
      expect(await rawLinesOf(guest.id)).toEqual(guestBefore);
      expect((await guestCart(guestToken)).status).toBe('ACTIVE');

      // The guest cart stays mergeable once the merge fits.
      await prisma.inventoryRecord.update({
        where: { id: short.recordIds[0] },
        data: { onHand: 6 },
      });
      await merge(customer, guestToken).expect(200);
      expect((await guestCart(guestToken)).status).toBe('MERGED');
      expect(await linesOf(cartId)).toEqual(
        [
          { offerId: a, quantity: 6, revision: 1 },
          { offerId: b, quantity: 1, revision: 0 },
        ].sort((left, right) => left.offerId.localeCompare(right.offerId)),
      );
    });
  });

  describe('shared pool first-fit parity with checkout', () => {
    // One variant stocked in two warehouses: the lower-id record holds 5, the
    // other 3. Two first-party offers sell from that pool. `later` has the
    // higher offer id but is put in the cart first, so an allocation that
    // followed offer id (or seller/shipping-group) order instead of cart
    // line order would disagree with the cart.
    async function sharedPool(): Promise<{
      pool: Pool;
      first: string;
      second: string;
    }> {
      const pool = await createPool([5, 3], 2);
      const [lowerId, higherId] = pool.offerIds as [string, string];
      return { pool, first: higherId, second: lowerId };
    }

    it('accepts a cart that first-fit can serve and checkout reserves it the same way', async () => {
      const customer = await createCustomer();
      const { pool, first, second } = await sharedPool();
      const [larger, smaller] = pool.recordIds as [string, string];

      await addItem(customer, first, 5).expect(201);
      await addItem(customer, second, 3).expect(201);

      const response = await checkout(customer).expect(201);
      const orderId = (response.body as { data: { order: { id: string } } })
        .data.order.id;
      const items = await prisma.orderItem.findMany({
        where: { orderId },
        select: { offerId: true, reservationId: true },
      });
      const reservationOf = async (
        offerId: string,
      ): Promise<{ inventoryRecordId: string; quantity: number }> => {
        const item = items.find((candidate) => candidate.offerId === offerId);
        return prisma.reservation.findUniqueOrThrow({
          where: { id: item?.reservationId ?? '' },
          select: { inventoryRecordId: true, quantity: true },
        });
      };
      // Each line is served whole by one record: 5 by the 5-unit record,
      // then 3 by the 3-unit one.
      expect(await reservationOf(first)).toEqual({
        inventoryRecordId: larger,
        quantity: 5,
      });
      expect(await reservationOf(second)).toEqual({
        inventoryRecordId: smaller,
        quantity: 3,
      });
      expect(await stockOf(larger)).toEqual({ onHand: 5, reserved: 5 });
      expect(await stockOf(smaller)).toEqual({ onHand: 3, reserved: 3 });
    });

    it('refuses an add first-fit cannot serve, and checkout refuses the same cart', async () => {
      const customer = await createCustomer();
      const { pool, first, second } = await sharedPool();

      await addItem(customer, first, 3).expect(201);
      // 3 + 5 = 8 units exist in total, but 3 takes the 5-unit record first
      // and leaves no single record that can serve 5.
      expectStockConflict(await addItem(customer, second, 5), second, 8);
      const cartId = await userCartId(customer.userId);
      expect(await linesOf(cartId)).toEqual([
        { offerId: first, quantity: 3, revision: 0 },
      ]);

      // Put the refused line in the cart behind the cart's back, after the
      // existing one, and check that checkout reaches the same verdict.
      const existing = await prisma.cartItem.findFirstOrThrow({
        where: { cartId },
      });
      await prisma.cartItem.create({
        data: {
          cartId,
          offerId: second,
          quantity: 5,
          createdAt: new Date(existing.createdAt.getTime() + 1_000),
        },
      });
      const before = await rawLinesOf(cartId);

      const response = await checkout(customer);
      expect(response.status).toBe(409);
      await expectNoOrder(customer, pool);
      expect(await rawLinesOf(cartId)).toEqual(before);
    });
  });

  describe('checkout revalidation', () => {
    it('refuses checkout when stock fell after the cart accepted the line, keeping the cart', async () => {
      const customer = await createCustomer();
      const pool = await createPool([5]);
      const [offer] = pool.offerIds as [string];
      await addItem(customer, offer, 3).expect(201);
      const cartId = await userCartId(customer.userId);
      const before = await rawLinesOf(cartId);
      await prisma.inventoryRecord.update({
        where: { id: pool.recordIds[0] },
        data: { onHand: 2 },
      });

      const response = await checkout(customer);

      expect(response.status).toBe(409);
      await expectNoOrder(customer, pool);
      expect(await rawLinesOf(cartId)).toEqual(before);
    });

    it('refuses checkout inside the order transaction when stock falls after its snapshot', async () => {
      const customer = await createCustomer();
      const pool = await createPool([5]);
      const [offer] = pool.offerIds as [string];
      await addItem(customer, offer, 3).expect(201);
      const cartId = await userCartId(customer.userId);
      const before = await rawLinesOf(cartId);

      // Past the cart view's availability pre-check, before any lock.
      const pause = pauseCheckoutAfterSnapshot();
      const pending = start([checkout(customer)]);
      await pause.reached;
      await prisma.inventoryRecord.update({
        where: { id: pool.recordIds[0] },
        data: { onHand: 2 },
      });
      pause.release();
      const [response] = (await pending) as [Response];

      expect(response.status).toBe(409);
      expect(errorOf(response).message).toBe('Insufficient available stock');
      await expectNoOrder(customer, pool);
      expect(await rawLinesOf(cartId)).toEqual(before);
    });

    it('refuses checkout with Cart changed when a selected line is edited between snapshot and order transaction', async () => {
      const customer = await createCustomer();
      const pool = await createPool([5]);
      const [offer] = pool.offerIds as [string];
      await addItem(customer, offer, 2).expect(201);
      const cartId = await userCartId(customer.userId);
      const item = await prisma.cartItem.findFirstOrThrow({
        where: { cartId },
      });

      const pause = pauseCheckoutAfterSnapshot();
      const pending = start([checkout(customer)]);
      await pause.reached;
      // A same-quantity edit: only the revision tells it apart.
      await updateItem(customer, item.id, 2).expect(200);
      pause.release();
      const [response] = (await pending) as [Response];

      expect(response.status).toBe(409);
      expect(errorOf(response).message).toBe(
        'Cart changed; review your cart and check out again',
      );
      await expectNoOrder(customer, pool);
      expect(await linesOf(cartId)).toEqual([
        { offerId: offer, quantity: 2, revision: 1 },
      ]);
    });
  });
});
