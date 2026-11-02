/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import {
  InventoryMovementType,
  OrderStatus,
  PrismaClient,
  ReservationStatus,
  type Prisma,
  type Reservation,
} from '@prisma/client';
import request from 'supertest';

import { InventoryService } from '../src/modules/inventory/inventory.service';
import { InventoryExpireReservationHandler } from '../src/modules/inventory/jobs/inventory-expire-reservation.handler';
import {
  OrdersService,
  type OrderWithItems,
} from '../src/modules/orders/orders.service';
import {
  createCheckoutHarness,
  type CheckoutHarness,
  type Customer,
} from './support/checkout-integration';

/**
 * Stage 7 inventory locking against a real, migrated Postgres database.
 *
 * Every interleaving here is forced with row-lock barriers, never timing: a
 * separately controlled transaction holds the contended row(s), the competing
 * operations are started one by one and the test waits until PostgreSQL itself
 * reports each of them blocked on a lock (pg_locks), then lets go. Interleavings
 * that are not lock waits are forced by gating a step of the code under test
 * (jest.spyOn) on a promise the test resolves.
 *
 * After every scenario the inventory journal is checked against the counters:
 * each record's onHand/reserved equal its initial stock replayed through its
 * movements, reserved equals its ACTIVE reservations, and every reservation has
 * exactly the movements its status implies (one RESERVATION; one RELEASE if
 * RELEASED/EXPIRED; one COMMITMENT if COMMITTED).
 */
jest.setTimeout(30_000);

type Deferred<T = void> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
};

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Running<T> = {
  outcome: Promise<PromiseSettledResult<T>>;
  settled(): boolean;
};

function run<T>(operation: () => Promise<T>): Running<T> {
  let done = false;
  const outcome = Promise.resolve()
    .then(operation)
    .then(
      (value): PromiseSettledResult<T> => ({ status: 'fulfilled', value }),
      (reason: unknown): PromiseSettledResult<T> => ({
        status: 'rejected',
        reason,
      }),
    )
    .finally(() => {
      done = true;
    });
  return { outcome, settled: () => done };
}

function describeError(reason: unknown): string {
  if (reason instanceof Error) {
    const code = (reason as { code?: unknown }).code;
    const meta = (reason as { meta?: unknown }).meta;
    return `${reason.name} ${typeof code === 'string' ? code : ''} ${reason.message} ${meta ? JSON.stringify(meta) : ''}`;
  }
  return String(reason);
}

function fulfilled<T>(outcome: PromiseSettledResult<T>): T {
  if (outcome.status === 'rejected')
    throw new Error(
      `Expected success, got: ${describeError(outcome.reason as unknown)}`,
    );
  return outcome.value;
}

function expectConflict(
  outcome: PromiseSettledResult<unknown>,
  message: RegExp,
): void {
  if (outcome.status === 'fulfilled')
    throw new Error('Expected a ConflictException, got success');
  const reason = outcome.reason as unknown;
  expect(describeError(reason)).not.toMatch(/40P01|deadlock|P2034/i);
  expect(reason).toBeInstanceOf(ConflictException);
  expect((reason as ConflictException).message).toMatch(message);
}

function expectNoDeadlock(outcomes: PromiseSettledResult<unknown>[]): void {
  for (const outcome of outcomes)
    if (outcome.status === 'rejected')
      expect(describeError(outcome.reason as unknown)).not.toMatch(
        /40P01|deadlock|P2034/i,
      );
}

function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

type StockRecord = { id: string; warehouseId: string };
type Pool = { variantId: string; offerId: string; records: StockRecord[] };
type Barrier = { release(): Promise<void> };

describe('Inventory locking (integration, real Postgres)', () => {
  let harness: CheckoutHarness;
  let inventory: InventoryService;
  let orders: OrdersService;
  let expireHandler: InventoryExpireReservationHandler;
  // Its own pool: lock diagnostics must never wait for a connection held by
  // the blocked checkouts they are watching.
  let observer: PrismaClient;
  const userIds: string[] = [];
  const productIds: string[] = [];
  const offerIds: string[] = [];
  const warehouseIds: string[] = [];
  /** Every record this spec created, with the onHand it was created with. */
  const initialOnHand = new Map<string, number>();
  const openBarriers = new Set<Barrier>();

  beforeAll(async () => {
    harness = await createCheckoutHarness('inv-lock');
    inventory = harness.app.get(InventoryService);
    orders = harness.app.get(OrdersService);
    expireHandler = harness.app.get(InventoryExpireReservationHandler);
    observer = new PrismaClient();
    await observer.$connect();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    for (const barrier of [...openBarriers])
      await barrier.release().catch(() => undefined);
  });

  afterAll(async () => {
    const prisma = harness.prisma;
    const recordIds = [...initialOnHand.keys()];
    const placed = await prisma.order.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, payment: { select: { id: true } } },
    });
    const orderIds = placed.map((order) => order.id);
    const paymentIds = placed.flatMap((order) =>
      order.payment ? [order.payment.id] : [],
    );
    const reservations = await prisma.reservation.findMany({
      where: { inventoryRecordId: { in: recordIds } },
      select: { id: true },
    });
    const jobKeys = [
      ...orderIds.map((id) => ['orderId', id] as const),
      ...paymentIds.map((id) => ['paymentId', id] as const),
      ...reservations.map((row) => ['reservationId', row.id] as const),
    ];
    for (const [key, id] of jobKeys)
      await prisma.backgroundJob.deleteMany({
        where: { payload: { path: [key], equals: id } },
      });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...orderIds, ...paymentIds] } },
    });
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    // Orders, carts, addresses and sessions cascade from the user; stock
    // journals are historical and must go before their records.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.reservation.deleteMany({
      where: { inventoryRecordId: { in: recordIds } },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { inventoryRecordId: { in: recordIds } },
    });
    await prisma.inventoryRecord.deleteMany({
      where: { id: { in: recordIds } },
    });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    await prisma.offer.deleteMany({ where: { id: { in: offerIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await observer.$disconnect();
    await harness.app.close();
  });

  // ---------------------------------------------------------------- fixtures

  async function createCustomer(): Promise<Customer> {
    const customer = await harness.createCustomer();
    userIds.push(customer.userId);
    return customer;
  }

  async function createOffer(variantId: string): Promise<string> {
    const offer = await harness.prisma.offer.create({
      data: { variantId, status: 'PUBLISHED' },
    });
    offerIds.push(offer.id);
    await harness.prisma.price.create({
      data: { offerId: offer.id, amount: 1_000, currency: 'ZMW' },
    });
    return offer.id;
  }

  async function createWarehouse(): Promise<string> {
    const suffix = randomUUID().slice(0, 8);
    const warehouse = await harness.prisma.warehouse.create({
      data: {
        name: `inv-lock warehouse ${suffix}`,
        code: `inv-lock-${suffix}`,
      },
    });
    warehouseIds.push(warehouse.id);
    return warehouse.id;
  }

  /**
   * A published first-party offer on a fresh variant, stocked by one record
   * per entry of `onHands` (each in its own warehouse). Records come back in
   * ascending id — the order checkout locks and allocates them in — and
   * `onHands[i]` is the stock of the i-th lowest id.
   */
  async function createPool(
    onHands: number[],
    ids: string[] = onHands.map(() => randomUUID()),
  ): Promise<Pool> {
    const suffix = randomUUID().slice(0, 8);
    const product = await harness.prisma.product.create({
      data: {
        name: `inv-lock product ${suffix}`,
        slug: `inv-lock-product-${suffix}`,
        status: 'PUBLISHED',
      },
    });
    productIds.push(product.id);
    const variant = await harness.prisma.productVariant.create({
      data: {
        productId: product.id,
        skuCode: `INV-LOCK-${suffix}`,
        status: 'PUBLISHED',
      },
    });
    const offerId = await createOffer(variant.id);
    const sortedIds = [...ids].sort(compareIds);
    const records: StockRecord[] = [];
    for (const [index, onHand] of onHands.entries()) {
      const warehouseId = await createWarehouse();
      const record = await harness.prisma.inventoryRecord.create({
        data: {
          id: sortedIds[index],
          warehouseId,
          variantId: variant.id,
          onHand,
        },
      });
      initialOnHand.set(record.id, onHand);
      records.push({ id: record.id, warehouseId });
    }
    return { variantId: variant.id, offerId, records };
  }

  async function addToCart(
    customer: Customer,
    offerId: string,
    quantity: number,
  ): Promise<void> {
    await request(harness.server())
      .post('/api/v1/cart/items?currency=ZMW')
      .set(customer.headers)
      .send({ offerId, quantity })
      .expect(201);
  }

  /** Pins the cart lines' createdAt so they sort in exactly this order. */
  async function orderCartLines(
    customer: Customer,
    offerIdsInOrder: string[],
  ): Promise<void> {
    const cart = await harness.prisma.cart.findUniqueOrThrow({
      where: { userId: customer.userId },
    });
    const base = Date.now() - 60_000;
    for (const [index, offerId] of offerIdsInOrder.entries())
      await harness.prisma.cartItem.update({
        where: { cartId_offerId: { cartId: cart.id, offerId } },
        data: { createdAt: new Date(base + index * 1_000) },
      });
  }

  function checkoutCart(customer: Customer): Promise<OrderWithItems> {
    return orders.createFromCart(customer.userId, customer.addressId, 'ZMW');
  }

  function buyNow(
    customer: Customer,
    offerId: string,
    quantity: number,
  ): Promise<OrderWithItems> {
    return orders.createFromOffer(
      customer.userId,
      offerId,
      quantity,
      customer.addressId,
      'ZMW',
    );
  }

  /** Emulates a reservation whose holder died: still ACTIVE, past expiry. */
  async function lapse(reservationId: string): Promise<void> {
    // A JS instant, not SQL now(): expires_at is a timestamp without time zone
    // that Prisma reads as UTC, so now() would be off by the server's offset.
    await harness.prisma.reservation.update({
      where: { id: reservationId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
  }

  // ---------------------------------------------------------------- barriers

  async function hold(
    lock: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<Barrier> {
    const locked = deferred();
    const release = deferred();
    const finished = harness.prisma.$transaction(
      async (tx) => {
        await lock(tx);
        locked.resolve();
        await release.promise;
      },
      { timeout: 25_000 },
    );
    finished.catch((error: unknown) => locked.reject(error));
    await locked.promise;
    const barrier: Barrier = {
      release: async () => {
        openBarriers.delete(barrier);
        release.resolve();
        await finished;
      },
    };
    openBarriers.add(barrier);
    return barrier;
  }

  function holdRecords(recordIds: string[]): Promise<Barrier> {
    return hold(async (tx) => {
      for (const id of [...recordIds].sort(compareIds))
        await tx.$queryRaw`SELECT id FROM inventory_records WHERE id = ${id}::uuid FOR UPDATE`;
    });
  }

  function holdOrder(orderId: string): Promise<Barrier> {
    return hold(
      (tx) =>
        tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`,
    );
  }

  /** Backends of this database waiting for a lock they have not been granted. */
  async function blockedBackends(): Promise<number> {
    const [row] = await observer.$queryRaw<{ blocked: number }[]>`
      SELECT count(DISTINCT l.pid)::int AS blocked
      FROM pg_locks l
      JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE NOT l.granted
        AND a.datname = current_database()
        AND l.pid <> pg_backend_pid()`;
    return row?.blocked ?? 0;
  }

  /**
   * Polls until at least `count` backends are blocked on a lock. Fails fast
   * if one of the watched operations finishes instead of blocking.
   */
  async function waitUntilBlocked(
    count: number,
    watched: Running<unknown>[],
  ): Promise<void> {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const finished = watched.find((operation) => operation.settled());
      if (finished) {
        const outcome = await finished.outcome;
        throw new Error(
          `Operation finished instead of blocking: ${
            outcome.status === 'fulfilled'
              ? 'fulfilled'
              : describeError(outcome.reason as unknown)
          }`,
        );
      }
      if ((await blockedBackends()) >= count) return;
      if (Date.now() > deadline)
        throw new Error(`Timed out waiting for ${count} blocked backend(s)`);
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  /**
   * Starts the operations one at a time behind `barrier`, each only once the
   * previous one is blocked on a lock, so they queue in exactly this order;
   * then releases the barrier and waits for all of them.
   */
  async function raceInOrder(
    barrier: Barrier,
    operations: (() => Promise<unknown>)[],
  ): Promise<PromiseSettledResult<unknown>[]> {
    const running: Running<unknown>[] = [];
    for (const operation of operations) {
      running.push(run(operation));
      await waitUntilBlocked(running.length, running);
    }
    await barrier.release();
    const outcomes = await Promise.all(running.map((r) => r.outcome));
    expectNoDeadlock(outcomes);
    return outcomes;
  }

  // -------------------------------------------------------------- assertions

  async function movementCount(
    reservationId: string,
    type: InventoryMovementType,
  ): Promise<number> {
    return harness.prisma.inventoryMovement.count({
      where: { referenceType: 'reservation', referenceId: reservationId, type },
    });
  }

  async function stock(
    recordId: string,
  ): Promise<{ onHand: number; reserved: number }> {
    return harness.prisma.inventoryRecord.findUniqueOrThrow({
      where: { id: recordId },
      select: { onHand: true, reserved: true },
    });
  }

  /**
   * The journal invariants: counters equal the initial stock replayed through
   * the movements, reserved equals the ACTIVE reservations, 0 <= reserved <=
   * onHand, and each reservation carries exactly the movements its status
   * implies.
   */
  async function expectConsistent(recordIds: string[]): Promise<void> {
    for (const recordId of recordIds) {
      const record = await harness.prisma.inventoryRecord.findUniqueOrThrow({
        where: { id: recordId },
      });
      const movements = await harness.prisma.inventoryMovement.findMany({
        where: { inventoryRecordId: recordId },
      });
      let onHand = initialOnHand.get(recordId) ?? 0;
      let reserved = 0;
      for (const movement of movements) {
        switch (movement.type) {
          case InventoryMovementType.RECEIPT:
          case InventoryMovementType.RETURN:
          case InventoryMovementType.ADJUSTMENT:
            onHand += movement.quantity;
            break;
          case InventoryMovementType.RESERVATION:
            reserved += movement.quantity;
            break;
          case InventoryMovementType.RELEASE:
            reserved -= movement.quantity;
            break;
          case InventoryMovementType.COMMITMENT:
            onHand -= movement.quantity;
            reserved -= movement.quantity;
            break;
        }
      }
      expect({
        recordId,
        onHand: record.onHand,
        reserved: record.reserved,
      }).toEqual({
        recordId,
        onHand,
        reserved,
      });
      expect(record.reserved).toBeGreaterThanOrEqual(0);
      expect(record.onHand).toBeGreaterThanOrEqual(record.reserved);

      const reservations = await harness.prisma.reservation.findMany({
        where: { inventoryRecordId: recordId },
      });
      const active = reservations
        .filter(
          (reservation) => reservation.status === ReservationStatus.ACTIVE,
        )
        .reduce((sum, reservation) => sum + reservation.quantity, 0);
      expect(record.reserved).toBe(active);
      for (const reservation of reservations) {
        const count = (type: InventoryMovementType) =>
          movements.filter(
            (movement) =>
              movement.type === type &&
              movement.referenceType === 'reservation' &&
              movement.referenceId === reservation.id,
          ).length;
        const released =
          reservation.status === ReservationStatus.RELEASED ||
          reservation.status === ReservationStatus.EXPIRED;
        expect({
          reservation: reservation.id,
          status: reservation.status,
          reservations: count(InventoryMovementType.RESERVATION),
          releases: count(InventoryMovementType.RELEASE),
          commitments: count(InventoryMovementType.COMMITMENT),
        }).toEqual({
          reservation: reservation.id,
          status: reservation.status,
          reservations: 1,
          releases: released ? 1 : 0,
          commitments:
            reservation.status === ReservationStatus.COMMITTED ? 1 : 0,
        });
      }
    }
  }

  async function orderReservations(orderId: string): Promise<Reservation[]> {
    const items = await harness.prisma.orderItem.findMany({
      where: { orderId },
      select: { reservationId: true },
    });
    const ids = items.map((item) => item.reservationId);
    expect(ids.every((id) => id !== null)).toBe(true);
    return harness.prisma.reservation.findMany({
      where: { id: { in: ids as string[] } },
    });
  }

  // --------------------------------------------------------------- scenarios

  it('(1) sweeps a lapsed reservation inside the checkout transaction for two lines on one variant, with no second backend ever waiting', async () => {
    const pool = await createPool([10]);
    const [record] = pool.records;
    const secondOffer = await createOffer(pool.variantId);
    const stale = await inventory.reserve(pool.variantId, 4);
    await lapse(stale.id);

    // 4 + 4 fits only once the lapsed 4 are swept back (10 on hand).
    const customer = await createCustomer();
    await addToCart(customer, pool.offerId, 4);
    await addToCart(customer, secondOffer, 4);
    await orderCartLines(customer, [pool.offerId, secondOffer]);

    // Pause the checkout right after its first sweep, still inside its
    // transaction and still holding the record lock, to look at the database
    // from outside. Before the H16 fix the sweep ran on `this.prisma`: a
    // second backend that queued behind the checkout's own record lock until
    // the transaction timed out.
    const sweepClients: unknown[] = [];
    const swept = deferred();
    const resume = deferred();
    const originalSweep = inventory.sweepExpired.bind(inventory);
    jest
      .spyOn(inventory, 'sweepExpired')
      .mockImplementation(async (recordId, tx) => {
        sweepClients.push(tx);
        await originalSweep(recordId, tx);
        if (sweepClients.length === 1) {
          swept.resolve();
          await resume.promise;
        }
      });
    const expireSpy = jest.spyOn(inventory, 'expireReservation');

    let stopMonitor = false;
    let samples = 0;
    let maxBlocked = 0;
    const monitor = (async () => {
      while (!stopMonitor) {
        maxBlocked = Math.max(maxBlocked, await blockedBackends());
        samples += 1;
        await new Promise((resolve) => setImmediate(resolve));
      }
    })();

    const startedAt = Date.now();
    const checkout = run(() => checkoutCart(customer));
    await Promise.race([
      swept.promise,
      checkout.outcome.then((outcome) => {
        throw new Error(
          `Checkout finished before sweeping: ${JSON.stringify(outcome.status)}`,
        );
      }),
    ]);

    // Mid-transaction: the sweep ran on the checkout's own transaction
    // client, expired the lapsed reservation through it (not yet visible to
    // other sessions), and nothing is waiting on any lock.
    expect(sweepClients[0]).toBeDefined();
    expect(sweepClients[0]).not.toBe(harness.prisma);
    expect(expireSpy).toHaveBeenCalledWith(stale.id, sweepClients[0]);
    expect(await blockedBackends()).toBe(0);
    expect(
      (
        await harness.prisma.reservation.findUniqueOrThrow({
          where: { id: stale.id },
        })
      ).status,
    ).toBe(ReservationStatus.ACTIVE);

    resume.resolve();
    const order = fulfilled(await checkout.outcome);
    const elapsed = Date.now() - startedAt;
    stopMonitor = true;
    await monitor;

    // Promptly: well inside Prisma's 5 s interactive-transaction timeout,
    // which is where a self-blocked checkout would have ended.
    expect(elapsed).toBeLessThan(4_000);
    expect(samples).toBeGreaterThan(0);
    expect(maxBlocked).toBe(0);
    expect(order.items).toHaveLength(2);
    expect(sweepClients.every((client) => client === sweepClients[0])).toBe(
      true,
    );

    const staleAfter = await harness.prisma.reservation.findUniqueOrThrow({
      where: { id: stale.id },
    });
    expect(staleAfter.status).toBe(ReservationStatus.EXPIRED);
    expect(await movementCount(stale.id, InventoryMovementType.RELEASE)).toBe(
      1,
    );
    const reservations = await orderReservations(order.id);
    expect(reservations.map((r) => [r.inventoryRecordId, r.quantity])).toEqual([
      [record!.id, 4],
      [record!.id, 4],
    ]);
    expect(await stock(record!.id)).toEqual({ onHand: 10, reserved: 8 });
    await expectConsistent([record!.id]);
  });

  it.each(['expiry job first', 'checkout first'] as const)(
    '(2) races reservation expiry against a checkout reserve on the same record (%s)',
    async (arrival) => {
      // Two records; the lower one's stock is held only by a lapsed
      // reservation. Checkout allocates first-fit by ascending id, so the
      // new reservation lands on the lower record exactly when the lapsed
      // one was expired first, whichever path expired it.
      const pool = await createPool([4, 4]);
      const [low, high] = pool.records;
      const stale = await inventory.reserve(pool.variantId, 4, {
        warehouseId: low!.warehouseId,
      });
      await lapse(stale.id);
      const customer = await createCustomer();

      const expire = () => expireHandler.handle({ reservationId: stale.id });
      const checkout = () => buyNow(customer, pool.offerId, 4);
      const barrier = await holdRecords([low!.id]);
      const outcomes = await raceInOrder(
        barrier,
        arrival === 'expiry job first'
          ? [expire, checkout]
          : [checkout, expire],
      );
      const [expired, ordered] =
        arrival === 'expiry job first' ? outcomes : [outcomes[1], outcomes[0]];

      fulfilled(expired!);
      const order = fulfilled(ordered!) as { id: string };
      expect(
        (
          await harness.prisma.reservation.findUniqueOrThrow({
            where: { id: stale.id },
          })
        ).status,
      ).toBe(ReservationStatus.EXPIRED);
      expect(await movementCount(stale.id, InventoryMovementType.RELEASE)).toBe(
        1,
      );
      const [reservation] = await orderReservations(order.id);
      expect(reservation).toMatchObject({
        inventoryRecordId: low!.id,
        quantity: 4,
        status: ReservationStatus.ACTIVE,
      });
      expect(await stock(low!.id)).toEqual({ onHand: 4, reserved: 4 });
      expect(await stock(high!.id)).toEqual({ onHand: 4, reserved: 0 });
      await expectConsistent([low!.id, high!.id]);
    },
  );

  it.each(['cancel first', 'confirmPayment first'] as const)(
    '(3) lets exactly one of cancel and confirmPayment settle the same order (%s)',
    async (arrival) => {
      const pool = await createPool([5]);
      const [record] = pool.records;
      const customer = await createCustomer();
      const order = await buyNow(customer, pool.offerId, 2);
      const [reservation] = await orderReservations(order.id);

      const cancel = () => orders.cancel(order.id);
      const confirm = () => orders.confirmPayment(order.id);
      const barrier = await holdOrder(order.id);
      const outcomes = await raceInOrder(
        barrier,
        arrival === 'cancel first' ? [cancel, confirm] : [confirm, cancel],
      );
      const [winner, loser] = outcomes;
      fulfilled(winner!);

      const settled = await harness.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { sellerOrders: true },
      });
      const after = await harness.prisma.reservation.findUniqueOrThrow({
        where: { id: reservation!.id },
      });
      if (arrival === 'cancel first') {
        expectConflict(loser!, /Only a pending order can be paid/);
        expect(settled.status).toBe(OrderStatus.CANCELLED);
        expect(after.status).toBe(ReservationStatus.RELEASED);
        expect(await stock(record!.id)).toEqual({ onHand: 5, reserved: 0 });
      } else {
        expectConflict(loser!, /A paid order must be refunded/);
        expect(settled.status).toBe(OrderStatus.PAID);
        expect(after.status).toBe(ReservationStatus.COMMITTED);
        expect(await stock(record!.id)).toEqual({ onHand: 3, reserved: 0 });
      }
      expect(settled.sellerOrders.map((group) => group.status)).toEqual([
        settled.status,
      ]);
      expect(
        await movementCount(reservation!.id, InventoryMovementType.RELEASE),
      ).toBe(arrival === 'cancel first' ? 1 : 0);
      expect(
        await movementCount(reservation!.id, InventoryMovementType.COMMITMENT),
      ).toBe(arrival === 'cancel first' ? 0 : 1);
      await expectConsistent([record!.id]);
    },
  );

  it.each(['release first', 'commit first'] as const)(
    '(3b) release and commit of the same reservation, without an order lock, apply exactly one movement (%s)',
    async (arrival) => {
      const pool = await createPool([5]);
      const [record] = pool.records;
      const reservation = await inventory.reserve(pool.variantId, 2);

      const release = () => inventory.release(reservation.id);
      const commit = () => inventory.commit(reservation.id);
      const barrier = await holdRecords([record!.id]);
      const outcomes = await raceInOrder(
        barrier,
        arrival === 'release first' ? [release, commit] : [commit, release],
      );

      const after = await harness.prisma.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      if (arrival === 'release first') {
        fulfilled(outcomes[0]!);
        expectConflict(
          outcomes[1]!,
          /Cannot commit a reservation with status RELEASED/,
        );
        expect(after.status).toBe(ReservationStatus.RELEASED);
        expect(await stock(record!.id)).toEqual({ onHand: 5, reserved: 0 });
      } else {
        // The late release is an idempotent no-op on a COMMITTED reservation.
        expect(fulfilled(outcomes[0]!)).toMatchObject({ status: 'COMMITTED' });
        expect(fulfilled(outcomes[1]!)).toMatchObject({ status: 'COMMITTED' });
        expect(after.status).toBe(ReservationStatus.COMMITTED);
        expect(await stock(record!.id)).toEqual({ onHand: 3, reserved: 0 });
      }
      expect(
        (await movementCount(reservation.id, InventoryMovementType.RELEASE)) +
          (await movementCount(
            reservation.id,
            InventoryMovementType.COMMITMENT,
          )),
      ).toBe(1);
      await expectConsistent([record!.id]);
    },
  );

  describe('(4) two checkouts touching records A and B in reversed line order', () => {
    async function setUp(onHand: number, quantity: number) {
      const poolA = await createPool([onHand]);
      const poolB = await createPool([onHand]);
      const first = await createCustomer();
      const second = await createCustomer();
      await addToCart(first, poolA.offerId, quantity);
      await addToCart(first, poolB.offerId, quantity);
      await orderCartLines(first, [poolA.offerId, poolB.offerId]);
      await addToCart(second, poolB.offerId, quantity);
      await addToCart(second, poolA.offerId, quantity);
      await orderCartLines(second, [poolB.offerId, poolA.offerId]);
      return {
        a: poolA.records[0]!.id,
        b: poolB.records[0]!.id,
        first,
        second,
      };
    }

    it('both succeed without a deadlock when stock suffices', async () => {
      const { a, b, first, second } = await setUp(4, 2);
      const barrier = await holdRecords([a, b]);
      const outcomes = await raceInOrder(barrier, [
        () => checkoutCart(first),
        () => checkoutCart(second),
      ]);
      outcomes.forEach((outcome) => fulfilled(outcome));
      expect(await stock(a)).toEqual({ onHand: 4, reserved: 4 });
      expect(await stock(b)).toEqual({ onHand: 4, reserved: 4 });
      await expectConsistent([a, b]);
    });

    it('exactly one succeeds for the last unit of each, the other rolls back whole (no oversell)', async () => {
      const { a, b, first, second } = await setUp(1, 1);
      const barrier = await holdRecords([a, b]);
      const outcomes = await raceInOrder(barrier, [
        () => checkoutCart(first),
        () => checkoutCart(second),
      ]);
      fulfilled(outcomes[0]!);
      expectConflict(outcomes[1]!, /Insufficient available stock/);
      expect(await stock(a)).toEqual({ onHand: 1, reserved: 1 });
      expect(await stock(b)).toEqual({ onHand: 1, reserved: 1 });
      expect(
        await harness.prisma.order.count({
          where: { userId: { in: [first.userId, second.userId] } },
        }),
      ).toBe(1);
      expect(
        await harness.prisma.reservation.count({
          where: { inventoryRecordId: { in: [a, b] } },
        }),
      ).toBe(2);
      await expectConsistent([a, b]);
    });
  });

  describe('(5) cancel / confirmPayment of a multi-item order against a checkout locking the same records in reverse line order', () => {
    const cases = [
      ['cancel', 'order operation first'],
      ['cancel', 'checkout first'],
      ['confirmPayment', 'order operation first'],
      ['confirmPayment', 'checkout first'],
    ] as const;

    it.each(cases)('%s, %s: no deadlock', async (operation, arrival) => {
      const poolA = await createPool([3]);
      const poolB = await createPool([3]);
      const a = poolA.records[0]!.id;
      const b = poolB.records[0]!.id;
      const payer = await createCustomer();
      await addToCart(payer, poolA.offerId, 1);
      await addToCart(payer, poolB.offerId, 1);
      await orderCartLines(payer, [poolA.offerId, poolB.offerId]);
      const pending = await checkoutCart(payer);
      const pendingReservations = await orderReservations(pending.id);
      expect(pendingReservations).toHaveLength(2);

      const buyer = await createCustomer();
      await addToCart(buyer, poolB.offerId, 2);
      await addToCart(buyer, poolA.offerId, 2);
      await orderCartLines(buyer, [poolB.offerId, poolA.offerId]);

      const settle = () =>
        operation === 'cancel'
          ? orders.cancel(pending.id)
          : orders.confirmPayment(pending.id);
      const checkout = () => checkoutCart(buyer);
      const barrier = await holdRecords([a, b]);
      const outcomes = await raceInOrder(
        barrier,
        arrival === 'checkout first' ? [checkout, settle] : [settle, checkout],
      );
      outcomes.forEach((outcome) => fulfilled(outcome));

      const settled = await harness.prisma.order.findUniqueOrThrow({
        where: { id: pending.id },
      });
      expect(settled.status).toBe(
        operation === 'cancel' ? OrderStatus.CANCELLED : OrderStatus.PAID,
      );
      for (const reservation of pendingReservations) {
        expect(
          await movementCount(reservation.id, InventoryMovementType.RELEASE),
        ).toBe(operation === 'cancel' ? 1 : 0);
        expect(
          await movementCount(reservation.id, InventoryMovementType.COMMITMENT),
        ).toBe(operation === 'cancel' ? 0 : 1);
      }
      const expected =
        operation === 'cancel'
          ? { onHand: 3, reserved: 2 }
          : { onHand: 2, reserved: 2 };
      expect(await stock(a)).toEqual(expected);
      expect(await stock(b)).toEqual(expected);
      await expectConsistent([a, b]);
    });
  });

  it('(6) never oversells the last units under N concurrent checkouts', async () => {
    const buyers = 6;
    // Three units across two warehouses; each checkout wants one.
    const pool = await createPool([2, 1]);
    const [low, high] = pool.records;
    const customers: Customer[] = [];
    for (let index = 0; index < buyers; index += 1)
      customers.push(await createCustomer());

    const barrier = await holdRecords([low!.id, high!.id]);
    const running = customers.map((customer) =>
      run(() => buyNow(customer, pool.offerId, 1)),
    );
    await waitUntilBlocked(buyers, running);
    await barrier.release();
    const outcomes = await Promise.all(running.map((r) => r.outcome));
    expectNoDeadlock(outcomes);

    const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
    const failed = outcomes.filter((o) => o.status === 'rejected');
    expect(succeeded).toHaveLength(3);
    expect(failed).toHaveLength(buyers - 3);
    failed.forEach((outcome) =>
      expectConflict(outcome, /Insufficient available stock/),
    );
    expect(await stock(low!.id)).toEqual({ onHand: 2, reserved: 2 });
    expect(await stock(high!.id)).toEqual({ onHand: 1, reserved: 1 });
    expect(
      await harness.prisma.order.count({
        where: { userId: { in: customers.map((c) => c.userId) } },
      }),
    ).toBe(3);
    expect(
      await harness.prisma.reservation.count({
        where: { inventoryRecordId: { in: [low!.id, high!.id] } },
      }),
    ).toBe(3);
    await expectConsistent([low!.id, high!.id]);
  });

  describe('(7) idempotent re-release and re-commit', () => {
    it('repeated release / releaseMany add one RELEASE, and a later commit is refused', async () => {
      const pool = await createPool([5]);
      const [record] = pool.records;
      const reservation = await inventory.reserve(pool.variantId, 2);

      await inventory.release(reservation.id);
      await inventory.release(reservation.id);
      await inventory.releaseMany([reservation.id, reservation.id]);
      await expect(inventory.commit(reservation.id)).rejects.toThrow(
        /Cannot commit a reservation with status RELEASED/,
      );

      expect(
        await movementCount(reservation.id, InventoryMovementType.RELEASE),
      ).toBe(1);
      expect(
        await movementCount(reservation.id, InventoryMovementType.COMMITMENT),
      ).toBe(0);
      expect(await stock(record!.id)).toEqual({ onHand: 5, reserved: 0 });
      await expectConsistent([record!.id]);
    });

    it('repeated commit / commitMany add one COMMITMENT, and a later release is a no-op', async () => {
      const pool = await createPool([5]);
      const [record] = pool.records;
      const reservation = await inventory.reserve(pool.variantId, 2);

      await inventory.commit(reservation.id);
      await inventory.commit(reservation.id);
      await inventory.commitMany([reservation.id, reservation.id]);
      expect(await inventory.release(reservation.id)).toMatchObject({
        status: ReservationStatus.COMMITTED,
      });

      expect(
        await movementCount(reservation.id, InventoryMovementType.COMMITMENT),
      ).toBe(1);
      expect(
        await movementCount(reservation.id, InventoryMovementType.RELEASE),
      ).toBe(0);
      expect(await stock(record!.id)).toEqual({ onHand: 3, reserved: 0 });
      await expectConsistent([record!.id]);
    });

    it('a repeated order cancel or confirmPayment moves stock once', async () => {
      const pool = await createPool([5]);
      const [record] = pool.records;
      const customer = await createCustomer();
      const cancelled = await buyNow(customer, pool.offerId, 1);
      const paid = await buyNow(customer, pool.offerId, 1);
      const [cancelledReservation] = await orderReservations(cancelled.id);
      const [paidReservation] = await orderReservations(paid.id);

      await orders.cancel(cancelled.id);
      expect((await orders.cancel(cancelled.id)).status).toBe(
        OrderStatus.CANCELLED,
      );
      await orders.confirmPayment(paid.id);
      expect((await orders.confirmPayment(paid.id)).status).toBe(
        OrderStatus.PAID,
      );

      expect(
        await movementCount(
          cancelledReservation!.id,
          InventoryMovementType.RELEASE,
        ),
      ).toBe(1);
      expect(
        await movementCount(
          paidReservation!.id,
          InventoryMovementType.COMMITMENT,
        ),
      ).toBe(1);
      expect(
        await harness.prisma.outboxEvent.count({
          where: { aggregateId: paid.id, topic: 'order.paid' },
        }),
      ).toBe(1);
      expect(await stock(record!.id)).toEqual({ onHand: 4, reserved: 0 });
      await expectConsistent([record!.id]);
    });

    it.each(['release', 'commit'] as const)(
      'two concurrent %s calls on one reservation move stock once',
      async (operation) => {
        const pool = await createPool([5]);
        const [record] = pool.records;
        const reservation = await inventory.reserve(pool.variantId, 2);
        const apply = () =>
          operation === 'release'
            ? inventory.release(reservation.id)
            : inventory.commit(reservation.id);

        const barrier = await holdRecords([record!.id]);
        const outcomes = await raceInOrder(barrier, [apply, apply]);
        outcomes.forEach((outcome) => fulfilled(outcome));

        const type =
          operation === 'release'
            ? InventoryMovementType.RELEASE
            : InventoryMovementType.COMMITMENT;
        expect(await movementCount(reservation.id, type)).toBe(1);
        expect(await stock(record!.id)).toEqual(
          operation === 'release'
            ? { onHand: 5, reserved: 0 }
            : { onHand: 3, reserved: 0 },
        );
        await expectConsistent([record!.id]);
      },
    );
  });

  it('(8) a record created after lockStockPools is ignored by that checkout instead of being locked out of order (locking-1)', async () => {
    // The pre-existing record gets the highest possible id prefix, so the
    // record a later receipt creates sorts below it — the review's R5/R2.
    const highId = `ffffffff-ffff-4fff-bfff-${randomUUID().slice(-12)}`;
    const pool = await createPool([5], [highId]);
    const [high] = pool.records;
    const first = await createCustomer();
    const second = await createCustomer();

    // Gate checkout A right after it locked its pool.
    const lockedByFirst = deferred<string[]>();
    const resumeFirst = deferred();
    const originalLock = inventory.lockStockPools.bind(inventory);
    let calls = 0;
    jest
      .spyOn(inventory, 'lockStockPools')
      .mockImplementation(async (offers, tx) => {
        const ids = await originalLock(offers, tx);
        calls += 1;
        if (calls === 1) {
          lockedByFirst.resolve(ids);
          await resumeFirst.promise;
        }
        return ids;
      });

    const checkoutA = run(() => buyNow(first, pool.offerId, 1));
    expect(
      await Promise.race([
        lockedByFirst.promise,
        checkoutA.outcome.then((outcome) => {
          throw new Error(
            `Checkout A finished before locking: ${outcome.status}`,
          );
        }),
      ]),
    ).toEqual([high!.id]);

    // A first receipt into a new warehouse commits a lower-id record for
    // the same variant while A holds the higher one.
    const newWarehouse = await createWarehouse();
    const received = await inventory.receiveStock(
      newWarehouse,
      pool.variantId,
      5,
    );
    initialOnHand.set(received.id, 0);
    expect(compareIds(received.id, high!.id)).toBe(-1);

    // Checkout B locks the new low record, then queues behind A on the high
    // one.
    const checkoutB = run(() => buyNow(second, pool.offerId, 1));
    await waitUntilBlocked(1, [checkoutA, checkoutB]);

    // Before locking-1, A's reserve re-queried the pool, found the new low
    // record and tried to lock it behind B: a 40P01 deadlock.
    resumeFirst.resolve();
    const outcomes = await Promise.all([checkoutA.outcome, checkoutB.outcome]);
    expectNoDeadlock(outcomes);
    const orderA = fulfilled(outcomes[0]);
    const orderB = fulfilled(outcomes[1]);

    const [reservationA] = await orderReservations(orderA.id);
    const [reservationB] = await orderReservations(orderB.id);
    // A could only use what it locked; B allocates first-fit from both.
    expect(reservationA!.inventoryRecordId).toBe(high!.id);
    expect(reservationB!.inventoryRecordId).toBe(received.id);
    expect(await stock(high!.id)).toEqual({ onHand: 5, reserved: 1 });
    expect(await stock(received.id)).toEqual({ onHand: 5, reserved: 1 });
    await expectConsistent([high!.id, received.id]);
  });
});
