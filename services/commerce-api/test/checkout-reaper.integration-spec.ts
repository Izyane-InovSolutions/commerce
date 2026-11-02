import { randomUUID } from 'node:crypto';

import { ServiceUnavailableException } from '@nestjs/common';
import type { BackgroundJob, CheckoutAttempt } from '@prisma/client';
import request from 'supertest';
import type { Response } from 'supertest';

import { CartService } from '../src/modules/cart/cart.service';
import { UnpaidOrderExpiryHandler } from '../src/modules/orders/jobs/unpaid-order-expiry.handler';
import {
  UNPAID_ORDER_EXPIRY_DELAY_MS,
  UNPAID_ORDER_EXPIRY_JOB_TYPE,
} from '../src/modules/orders/jobs/unpaid-order-expiry.job';
import { PaymentsService } from '../src/modules/payments/payments.service';
import type { PaymentProvider } from '../src/modules/payments/payment-provider';
import {
  deferred,
  holdLock,
  type HeldLock,
  track,
  waitForLockWaiters,
  waitUntil,
} from './support/concurrency';
import {
  createCheckoutHarness,
  type CheckoutHarness,
  type Customer,
  type StockedOffer,
} from './support/checkout-integration';

/**
 * The unpaid-order reaper (orders.expire_unpaid) and the cancel-vs-payment
 * race, against a real migrated Postgres. Time is moved with JS Dates written
 * into the rows (never SQL now(): the local server need not run in UTC), and
 * interleavings are forced with held row locks, never sleeps.
 */
describe('Unpaid checkout order reaper (integration, real Postgres)', () => {
  let harness: CheckoutHarness;
  let reaper: UnpaidOrderExpiryHandler;
  let payments: PaymentsService;
  let cart: CartService;

  beforeAll(async () => {
    harness = await createCheckoutHarness('checkout-reaper');
    reaper = harness.app.get(UnpaidOrderExpiryHandler);
    payments = harness.app.get(PaymentsService);
    cart = harness.app.get(CartService);
  });

  beforeEach(() => harness.provider.reset());

  afterEach(() => {
    jest.restoreAllMocks();
    delete (harness.provider as Partial<PaymentProvider>).prepareInput;
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  type ErrorBody = {
    error: { code: string; details: { field?: string; message: string }[] };
  };

  function detail(response: Response, field: string): string | undefined {
    return (response.body as ErrorBody).error?.details?.find(
      (entry) => entry.field === field,
    )?.message;
  }

  function attemptFor(
    customer: Customer,
    key: string,
  ): Promise<CheckoutAttempt> {
    return harness.prisma.checkoutAttempt.findUniqueOrThrow({
      where: { userId_key: { userId: customer.userId, key } },
    });
  }

  async function orderStatus(orderId: string): Promise<string> {
    return (
      await harness.prisma.order.findUniqueOrThrow({ where: { id: orderId } })
    ).status;
  }

  function paymentCount(customer: Customer): Promise<number> {
    return harness.prisma.payment.count({
      where: { order: { userId: customer.userId } },
    });
  }

  /** What the payment currency converter does when FX rates are unavailable. */
  function failNextPaymentPreparation(): void {
    (harness.provider as Partial<PaymentProvider>).prepareInput = (): never => {
      throw new ServiceUnavailableException(
        'This payment method is temporarily unavailable',
      );
    };
  }

  /** The reaper job the order transaction enqueued for this order. */
  async function reaperJobFor(orderId: string): Promise<BackgroundJob> {
    const jobs = await harness.prisma.backgroundJob.findMany({
      where: {
        type: UNPAID_ORDER_EXPIRY_JOB_TYPE,
        payload: { path: ['orderId'], equals: orderId },
      },
    });
    expect(jobs).toHaveLength(1);
    return jobs[0]!;
  }

  /** Moves the order's reservations into the past, as the clock would. */
  async function lapseReservations(orderId: string): Promise<void> {
    const items = await harness.prisma.orderItem.findMany({
      where: { orderId },
      select: { reservationId: true },
    });
    await harness.prisma.reservation.updateMany({
      where: { id: { in: items.flatMap((item) => item.reservationId ?? []) } },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
  }

  async function cartLines(
    customer: Customer,
  ): Promise<{ offerId: string; quantity: number }[]> {
    return harness.prisma.cartItem.findMany({
      where: { cart: { userId: customer.userId } },
      select: { offerId: true, quantity: true },
    });
  }

  /** A keyed cart checkout whose payment never started: a transient 503. */
  async function strandedKeyedCheckout(
    customer: Customer,
    offer: StockedOffer,
    quantity: number,
  ): Promise<{ key: string; orderId: string }> {
    await harness.addToCart(customer, offer, quantity);
    const key = randomUUID();
    failNextPaymentPreparation();
    const response = await harness.postCheckout(customer, key);
    expect(response.status).toBe(503);
    delete (harness.provider as Partial<PaymentProvider>).prepareInput;
    const attempt = await attemptFor(customer, key);
    // Kept for a same-key resume: released, linked, no payment, stock held.
    expect(attempt).toMatchObject({
      status: 'IN_PROGRESS',
      stage: 'ORDER_CREATED',
      ownerToken: null,
      leaseExpiresAt: null,
    });
    expect(attempt.orderId).toBeTruthy();
    return { key, orderId: attempt.orderId! };
  }

  it('enqueues the reaper in the order transaction, just after the reservation TTL', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const before = Date.now();
    const { orderId } = await strandedKeyedCheckout(customer, offer, 3);

    const job = await reaperJobFor(orderId);
    const [reservation] = await harness.prisma.reservation.findMany({
      where: { inventoryRecordId: offer.inventoryRecordId },
    });
    expect(job.status).toBe('PENDING');
    expect(job.payload).toEqual({ orderId });
    expect(job.runAt.getTime()).toBeGreaterThanOrEqual(
      before + UNPAID_ORDER_EXPIRY_DELAY_MS,
    );
    expect(job.runAt.getTime()).toBeGreaterThan(
      reservation!.expiresAt.getTime(),
    );
  });

  it('cancels a stranded keyed order once its reservations lapse: stock back, key REJECTED CHECKOUT_EXPIRED, cart kept', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const { key, orderId } = await strandedKeyedCheckout(customer, offer, 3);
    expect(await orderStatus(orderId)).toBe('PENDING_PAYMENT');
    expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 3 });
    // Without the reaper, the durable cart cleanup can only keep waiting.
    await expect(
      cart.cleanUpCheckout(customer.userId, orderId),
    ).rejects.toThrow(/not yet recorded/);

    await lapseReservations(orderId);
    const job = await reaperJobFor(orderId);
    await reaper.handle(job.payload);

    expect(await orderStatus(orderId)).toBe('CANCELLED');
    expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 0 });
    expect(await paymentCount(customer)).toBe(0);
    expect(await attemptFor(customer, key)).toMatchObject({
      status: 'REJECTED',
      stage: 'FINISHED',
      errorStatus: 409,
      ownerToken: null,
      leaseExpiresAt: null,
      completedAt: expect.any(Date) as unknown,
    });

    // The same key replays the recorded answer and checks nothing out.
    const retry = await harness.postCheckout(customer, key);
    expect(retry.status).toBe(409);
    expect(detail(retry, 'code')).toBe('CHECKOUT_EXPIRED');
    expect(detail(retry, 'orderId')).toBe(orderId);
    const replay = await harness.postCheckout(customer, key);
    expect(JSON.stringify((replay.body as ErrorBody).error)).toBe(
      JSON.stringify((retry.body as ErrorBody).error),
    );
    expect(
      await harness.prisma.order.count({ where: { userId: customer.userId } }),
    ).toBe(1);
    expect(harness.provider.initializeCalls).toHaveLength(0);

    // The cart was never consumed, and its cleanup job now completes as a no-op.
    await expect(
      cart.cleanUpCheckout(customer.userId, orderId),
    ).resolves.toBeUndefined();
    expect(await cartLines(customer)).toEqual([
      { offerId: offer.offerId, quantity: 3 },
    ]);

    // Running again (a redelivered job) changes nothing.
    await reaper.handle(job.payload);
    expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 0 });
  });

  it('keeps retrying while a request holds a live lease on the attempt, then cancels once it lapses', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const { key, orderId } = await strandedKeyedCheckout(customer, offer, 2);
    await lapseReservations(orderId);
    // A retry has just claimed the attempt (e.g. it is mid-resume).
    const ownerToken = randomUUID();
    const liveLease = new Date(Date.now() + 60_000);
    const attempt = await attemptFor(customer, key);
    await harness.prisma.checkoutAttempt.update({
      where: { id: attempt.id },
      data: { ownerToken, leaseExpiresAt: liveLease },
    });
    const job = await reaperJobFor(orderId);

    await expect(reaper.handle(job.payload)).rejects.toThrow(
      /still holds a live lease/,
    );
    expect(await orderStatus(orderId)).toBe('PENDING_PAYMENT');
    expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 2 });
    expect(await attemptFor(customer, key)).toMatchObject({
      status: 'IN_PROGRESS',
      ownerToken,
      leaseExpiresAt: liveLease,
    });

    // That request died: its lease lapses and the next run gives the order up.
    await harness.prisma.checkoutAttempt.update({
      where: { id: attempt.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    await reaper.handle(job.payload);
    expect(await orderStatus(orderId)).toBe('CANCELLED');
    expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 0 });
    expect(await attemptFor(customer, key)).toMatchObject({
      status: 'REJECTED',
      errorStatus: 409,
      ownerToken: null,
    });
  });

  it('is a no-op for an order that has a payment row, even with lapsed reservations', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const key = randomUUID();
    const placed = await harness.checkout(customer, offer, 2, key);
    expect(placed.payment.status).toBe('PENDING');
    await lapseReservations(placed.order.id);
    const before = await attemptFor(customer, key);

    await reaper.handle((await reaperJobFor(placed.order.id)).payload);

    expect(await orderStatus(placed.order.id)).toBe('PENDING_PAYMENT');
    expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 2 });
    expect(await attemptFor(customer, key)).toEqual(before);
  });

  it('is a no-op for an order already paid', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const placed = await harness.checkout(customer, offer, 2);
    await harness.deliverWebhook(placed.payment.providerReference, 'SUCCEEDED');
    expect(await orderStatus(placed.order.id)).toBe('PAID');

    await reaper.handle((await reaperJobFor(placed.order.id)).payload);

    expect(await orderStatus(placed.order.id)).toBe('PAID');
    expect(await harness.stock(offer)).toEqual({ onHand: 8, reserved: 0 });
  });

  it('is a no-op for a keyless buy-now order already cancelled (and enqueues the reaper for it too)', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    failNextPaymentPreparation();
    const response = await harness.postBuyNow(customer, offer, 4);
    expect(response.status).toBe(503);
    const order = await harness.prisma.order.findFirstOrThrow({
      where: { userId: customer.userId },
    });
    // Keyless: nothing can resume it, so checkout cancelled it at once.
    expect(order.status).toBe('CANCELLED');
    expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 0 });

    await reaper.handle((await reaperJobFor(order.id)).payload);

    expect(await orderStatus(order.id)).toBe('CANCELLED');
    expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 0 });
  });

  describe('races with the payment insert', () => {
    /** Pauses the next initializeForOrder call before its transaction starts. */
    function pauseNextPaymentInitialization(): {
      reached: Promise<void>;
      proceed(): void;
    } {
      const reached = deferred();
      const proceed = deferred();
      const original = payments.initializeForOrder.bind(payments);
      jest
        .spyOn(payments, 'initializeForOrder')
        .mockImplementationOnce(async (...args) => {
          reached.resolve();
          await proceed.promise;
          return original(...args);
        });
      return { reached: reached.promise, proceed: () => proceed.resolve() };
    }

    /**
     * Waits until `count` backends are queued behind `pid`, directly or
     * behind a backend that is itself waiting on it: the second waiter for
     * one row lock may be reported as blocked by the first waiter only.
     */
    function waitForQueueBehind(pid: number, count: number): Promise<void> {
      return waitUntil(async () => {
        const [row] = await harness.prisma.$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity waiter
          WHERE waiter.wait_event_type = 'Lock'
            AND (${pid}::int = ANY(pg_blocking_pids(waiter.pid))
              OR EXISTS (
                SELECT 1 FROM pg_stat_activity middle
                WHERE ${pid}::int = ANY(pg_blocking_pids(middle.pid))
                  AND middle.pid = ANY(pg_blocking_pids(waiter.pid))))`;
        return (row?.waiting ?? 0) >= count;
      }, `${count} backend(s) queue behind backend ${pid}`);
    }

    function lockOrder(orderId: string): Promise<HeldLock> {
      return holdLock(
        harness.prisma,
        (tx) =>
          tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`,
      );
    }

    it('a customer cancel that read "no payment" before a checkout inserted one refuses (409) instead of cancelling over a submitted payment', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      const paused = pauseNextPaymentInitialization();

      const checkout = track(harness.postCheckout(customer, key));
      await paused.reached;
      const { orderId } = await attemptFor(customer, key);
      // The payment transaction (attempt guard, then the order lock) is
      // queued behind a lock the test holds on the order row.
      const orderLock = await lockOrder(orderId!);
      paused.proceed();
      await waitForLockWaiters(harness.prisma, orderLock.pid);

      // The cancel's unlocked read sees no payment yet; it then queues for
      // the same order lock behind the payment insert.
      const cancel = track(
        request(harness.server())
          .post(`/api/v1/orders/${orderId}/cancel`)
          .set(customer.headers),
      );
      await waitForQueueBehind(orderLock.pid, 2);
      await orderLock.release();

      const [checkoutResponse, cancelResponse] = await Promise.all([
        checkout.promise,
        cancel.promise,
      ]);
      expect(checkoutResponse.status).toBe(201);
      expect(cancelResponse.status).toBe(409);
      expect(
        (cancelResponse.body as { error: { message: string } }).error.message,
      ).toBe('Payment is starting; retry cancellation');
      // The submitted payment's order kept its stock.
      expect(await orderStatus(orderId!)).toBe('PENDING_PAYMENT');
      expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 2 });
      expect(harness.provider.initializeCalls).toHaveLength(1);

      // The retry sees the payment and takes the payment-aware branch: the
      // order and its payment end cancelled together.
      const retry = await request(harness.server())
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set(customer.headers);
      expect(retry.status).toBe(200);
      const payment = await harness.prisma.payment.findUniqueOrThrow({
        where: { orderId: orderId! },
      });
      expect(await orderStatus(orderId!)).toBe('CANCELLED');
      expect(payment.status).toBe('CANCELLED');
      expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 0 });
    });

    it('the reaper and a payment insert serialize on checkout_attempts → orders without deadlock: the insert wins, the reaper no-ops', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      const paused = pauseNextPaymentInitialization();

      const checkout = track(harness.postCheckout(customer, key));
      await paused.reached;
      const { orderId } = await attemptFor(customer, key);
      await lapseReservations(orderId!);
      const orderLock = await lockOrder(orderId!);
      // The payment transaction takes the attempt row (its guard), then
      // waits for the order row.
      paused.proceed();
      await waitForLockWaiters(harness.prisma, orderLock.pid);

      // The reaper locks the attempt row first, so it queues behind the
      // payment transaction rather than taking the order row out of order.
      const reaped = track(
        reaper.handle((await reaperJobFor(orderId!)).payload),
      );
      await waitForLockWaiters(harness.prisma, orderLock.pid, { depth: 2 });
      await orderLock.release();

      const [checkoutResponse] = await Promise.all([
        checkout.promise,
        reaped.promise,
      ]);
      expect(checkoutResponse.status).toBe(201);
      expect(await paymentCount(customer)).toBe(1);
      expect(await orderStatus(orderId!)).toBe('PENDING_PAYMENT');
      expect(await attemptFor(customer, key)).toMatchObject({
        status: 'COMPLETED',
      });
    });
  });
});
