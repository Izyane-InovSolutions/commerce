import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  BackgroundJobStatus,
  OrderStatus,
  PaymentStatus,
  type BackgroundJob,
} from '@prisma/client';
import request from 'supertest';

import {
  BackgroundJobsService,
  type EnqueueJobInput,
} from '../src/infrastructure/jobs/background-jobs.service';
import { CartService } from '../src/modules/cart/cart.service';
import {
  CART_CLEANUP_JOB_TYPE,
  CartCleanupHandler,
} from '../src/modules/cart/jobs/cart-cleanup.handler';
import { OrdersService } from '../src/modules/orders/orders.service';
import { PaymentOutcomeUnknownException } from '../src/modules/payments/gateway-errors';
import {
  createCheckoutHarness,
  type CheckoutHarness,
  type CheckoutResponse,
  type Customer,
  type StockedOffer,
} from './support/checkout-integration';

type CartLine = {
  id: string;
  offerId: string;
  quantity: number;
  revision: number;
};

type JobRun = { outcome: 'succeeded' } | { outcome: 'failed'; error: Error };

/**
 * Post-checkout cart cleanup against a real, migrated Postgres database:
 * the durable `cart.cleanup_items` job the order transaction enqueues, the
 * inline best-effort cleanup CheckoutService runs after payment starts, and
 * CartService.cleanUpCheckout's receipt matching (line id + quantity +
 * revision). Jobs are run one at a time through CartCleanupHandler with the
 * same claim/complete/fail bookkeeping JobWorkerService uses (scheduled
 * workers are disabled in tests), ignoring their runAt delay — that stands
 * in for the time passing between attempts.
 */
describe('Cart cleanup after checkout (integration, real Postgres)', () => {
  let harness: CheckoutHarness;
  let cartService: CartService;
  let handler: CartCleanupHandler;
  let jobs: BackgroundJobsService;
  let ordersService: OrdersService;

  beforeAll(async () => {
    harness = await createCheckoutHarness('cart-cleanup-int');
    cartService = harness.app.get(CartService);
    handler = harness.app.get(CartCleanupHandler);
    jobs = harness.app.get(BackgroundJobsService);
    ordersService = harness.app.get(OrdersService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  async function addToCart(
    customer: Customer,
    offer: StockedOffer,
    quantity: number,
  ): Promise<string> {
    const response = await request(harness.server())
      .post('/api/v1/cart/items?currency=ZMW')
      .set(customer.headers)
      .send({ offerId: offer.offerId, quantity })
      .expect(201);
    const items = (
      response.body as { data: { items: { id: string; offerId: string }[] } }
    ).data.items;
    return items.find((item) => item.offerId === offer.offerId)!.id;
  }

  function postCheckout(
    customer: Customer,
    body: Record<string, unknown> = {},
    idempotencyKey?: string,
  ): request.Test {
    const call = request(harness.server())
      .post('/api/v1/checkout')
      .set(customer.headers);
    if (idempotencyKey) call.set('Idempotency-Key', idempotencyKey);
    return call.send({
      shippingAddressId: customer.addressId,
      currency: 'ZMW',
      ...body,
    });
  }

  async function checkoutOk(
    customer: Customer,
    body: Record<string, unknown> = {},
    idempotencyKey: string = randomUUID(),
  ): Promise<CheckoutResponse> {
    const response = await postCheckout(customer, body, idempotencyKey);
    expect(response.status).toBe(201);
    return (response.body as { data: CheckoutResponse }).data;
  }

  function cartLines(customer: Customer): Promise<CartLine[]> {
    return harness.prisma.cartItem.findMany({
      where: { cart: { userId: customer.userId } },
      select: { id: true, offerId: true, quantity: true, revision: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  function cleanupJobs(orderId: string): Promise<BackgroundJob[]> {
    return harness.prisma.backgroundJob.findMany({
      where: {
        type: CART_CLEANUP_JOB_TYPE,
        payload: { path: ['orderId'], equals: orderId },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async function onlyCleanupJob(orderId: string): Promise<BackgroundJob> {
    const found = await cleanupJobs(orderId);
    expect(found).toHaveLength(1);
    return found[0]!;
  }

  /**
   * One worker attempt at exactly this job: claims it the way claimNext
   * does (RUNNING, attempts + 1, fresh lock token), runs the registered
   * handler, then records the outcome through BackgroundJobsService.
   */
  async function runJob(jobId: string): Promise<JobRun> {
    const lockToken = randomUUID();
    const claimed = await harness.prisma.backgroundJob.updateMany({
      where: { id: jobId, status: BackgroundJobStatus.PENDING },
      data: {
        status: BackgroundJobStatus.RUNNING,
        attempts: { increment: 1 },
        lockedAt: new Date(),
        lockToken,
      },
    });
    expect(claimed.count).toBe(1);
    const job = await harness.prisma.backgroundJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    try {
      await handler.handle(job.payload);
    } catch (error) {
      await jobs.fail(jobId, lockToken, error);
      return { outcome: 'failed', error: error as Error };
    }
    await jobs.complete(jobId, lockToken);
    return { outcome: 'succeeded' };
  }

  function job(jobId: string): Promise<BackgroundJob> {
    return harness.prisma.backgroundJob.findUniqueOrThrow({
      where: { id: jobId },
    });
  }

  /** Makes the inline cleanup after checkout fail once, leaving the job. */
  function failInlineCleanupOnce(): jest.SpyInstance {
    return jest
      .spyOn(cartService, 'cleanUpCheckout')
      .mockRejectedValueOnce(new Error('cart write failed (injected)'));
  }

  /** Makes the given cart-cleanup enqueue calls (1-based) fail. */
  function failCartCleanupEnqueue(fails: (attempt: number) => boolean): {
    spy: jest.SpyInstance;
    cartCleanupCalls(): number;
  } {
    // JobsModule is global: OrdersService shares this one instance.
    const enqueue = jobs.enqueue.bind(jobs);
    let calls = 0;
    const spy = jest
      .spyOn(jobs, 'enqueue')
      .mockImplementation((input: EnqueueJobInput, client) => {
        if (input.type === CART_CLEANUP_JOB_TYPE && fails(++calls))
          return Promise.reject(new Error('job queue unavailable (injected)'));
        return enqueue(input, client);
      });
    return { spy, cartCleanupCalls: () => calls };
  }

  it('partial checkout (itemIds) removes only the selected lines and leaves unselected lines alone', async () => {
    const customer = await harness.createCustomer();
    const [a, b, c] = [
      await harness.createStockedOffer(10),
      await harness.createStockedOffer(10),
      await harness.createStockedOffer(10),
    ];
    const lineA = await addToCart(customer, a, 2);
    const lineB = await addToCart(customer, b, 1);
    const lineC = await addToCart(customer, c, 3);

    const result = await checkoutOk(customer, { itemIds: [lineA, lineC] });

    // Inline cleanup ran: only the selected lines are gone.
    expect(result.order.items).toHaveLength(2);
    expect(await cartLines(customer)).toEqual([
      { id: lineB, offerId: b.offerId, quantity: 1, revision: 0 },
    ]);
    const order = await harness.prisma.order.findUniqueOrThrow({
      where: { id: result.order.id },
      select: { checkoutCartSnapshot: true },
    });
    expect(
      (order.checkoutCartSnapshot as { id: string }[])
        .map((line) => line.id)
        .sort(),
    ).toEqual([lineA, lineC].sort());

    // The durable job still runs later and is a no-op for the unselected line.
    const cleanup = await onlyCleanupJob(result.order.id);
    expect(cleanup.payload).toEqual({
      userId: customer.userId,
      orderId: result.order.id,
    });
    expect(cleanup.maxAttempts).toBe(20);
    expect(cleanup.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(await runJob(cleanup.id)).toEqual({ outcome: 'succeeded' });
    expect(await cartLines(customer)).toEqual([
      { id: lineB, offerId: b.offerId, quantity: 1, revision: 0 },
    ]);
  });

  it('retries a cleanup the inline step and first job attempt could not do, then removes the lines', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    await addToCart(customer, offer, 2);
    const inline = failInlineCleanupOnce();

    const result = await checkoutOk(customer);

    // The checkout succeeded although the inline cleanup threw.
    expect(inline).toHaveBeenCalledTimes(1);
    expect(result.payment.status).toBe('PENDING');
    expect(await cartLines(customer)).toHaveLength(1);
    const cleanup = await onlyCleanupJob(result.order.id);

    // First job attempt hits the same failure: retried, nothing deleted.
    inline.mockRejectedValueOnce(new Error('cart write failed again'));
    const first = await runJob(cleanup.id);
    expect(first.outcome).toBe('failed');
    expect(await job(cleanup.id)).toMatchObject({
      status: BackgroundJobStatus.PENDING,
      attempts: 1,
      lastError: 'cart write failed again',
    });
    expect(await cartLines(customer)).toHaveLength(1);

    // A later attempt succeeds.
    expect(await runJob(cleanup.id)).toEqual({ outcome: 'succeeded' });
    expect(await job(cleanup.id)).toMatchObject({
      status: BackgroundJobStatus.SUCCEEDED,
      attempts: 2,
      lastError: null,
    });
    expect(await cartLines(customer)).toEqual([]);
  });

  it('keeps a line added after checkout, a same-quantity edit (revision bump) and a remove-and-re-add (new id)', async () => {
    const customer = await harness.createCustomer();
    const edited = await harness.createStockedOffer(10);
    const readded = await harness.createStockedOffer(10);
    const consumed = await harness.createStockedOffer(10);
    const later = await harness.createStockedOffer(10);
    const editedLine = await addToCart(customer, edited, 2);
    const readdedLine = await addToCart(customer, readded, 1);
    const consumedLine = await addToCart(customer, consumed, 4);
    failInlineCleanupOnce();

    const result = await checkoutOk(customer);
    expect(await cartLines(customer)).toHaveLength(3);

    // Same quantity, but a new revision: the shopper touched it after paying.
    await request(harness.server())
      .patch(`/api/v1/cart/items/${editedLine}?currency=ZMW`)
      .set(customer.headers)
      .send({ quantity: 2 })
      .expect(200);
    // Removed and re-added at the same quantity: a new line id.
    await request(harness.server())
      .delete(`/api/v1/cart/items/${readdedLine}?currency=ZMW`)
      .set(customer.headers)
      .expect(200);
    const newReaddedLine = await addToCart(customer, readded, 1);
    expect(newReaddedLine).not.toBe(readdedLine);
    // A new offer added after checkout.
    const laterLine = await addToCart(customer, later, 1);

    const cleanup = await onlyCleanupJob(result.order.id);
    expect(await runJob(cleanup.id)).toEqual({ outcome: 'succeeded' });

    const remaining = await cartLines(customer);
    expect(remaining.map((line) => line.id).sort()).toEqual(
      [editedLine, newReaddedLine, laterLine].sort(),
    );
    expect(remaining.find((line) => line.id === editedLine)).toEqual({
      id: editedLine,
      offerId: edited.offerId,
      quantity: 2,
      revision: 1,
    });
    expect(remaining.some((line) => line.id === consumedLine)).toBe(false);
  });

  it('is idempotent: repeated jobs (and the inline run) delete each checked-out line once and nothing else', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const other = await harness.createStockedOffer(10);
    await addToCart(customer, offer, 2);

    const result = await checkoutOk(customer);
    expect(await cartLines(customer)).toEqual([]);

    // The same offer re-added at the same quantity, plus another line.
    const readded = await addToCart(customer, offer, 2);
    const otherLine = await addToCart(customer, other, 1);
    const cleanup = await onlyCleanupJob(result.order.id);
    expect(await runJob(cleanup.id)).toEqual({ outcome: 'succeeded' });
    await cartService.cleanUpCheckout(customer.userId, result.order.id);
    await handler.handle({
      userId: customer.userId,
      orderId: result.order.id,
    });

    // A webhook settling the payment enqueues one more cleanup; it too
    // leaves the cart alone.
    await harness.deliverWebhook(result.payment.providerReference, 'SUCCEEDED');
    const all = await cleanupJobs(result.order.id);
    expect(all).toHaveLength(2);
    const fromConfirm = all.find((row) => row.id !== cleanup.id)!;
    expect(await runJob(fromConfirm.id)).toEqual({ outcome: 'succeeded' });

    expect((await cartLines(customer)).map((line) => line.id).sort()).toEqual(
      [readded, otherLine].sort(),
    );
  });

  it('preserves the cart when the payment is declined inline', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const line = await addToCart(customer, offer, 2);
    const cleanUp = jest.spyOn(cartService, 'cleanUpCheckout');
    jest.spyOn(harness.provider, 'initialize').mockImplementationOnce((input) =>
      Promise.resolve({
        providerReference: `fake-ref-${input.paymentId}`,
        status: 'FAILED',
        failureMessage: 'Card declined',
      }),
    );

    const result = await checkoutOk(customer);

    expect(result.payment.status).toBe('FAILED');
    expect(result.order.status).toBe('CANCELLED');
    // CheckoutService does not even attempt the inline cleanup.
    expect(cleanUp).not.toHaveBeenCalled();
    const cleanup = await onlyCleanupJob(result.order.id);
    expect(await runJob(cleanup.id)).toEqual({ outcome: 'succeeded' });
    expect(await cartLines(customer)).toEqual([
      { id: line, offerId: offer.offerId, quantity: 2, revision: 0 },
    ]);
    expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 0 });
  });

  it('preserves the cart when the payment fails after the inline cleanup was deferred', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const line = await addToCart(customer, offer, 3);
    failInlineCleanupOnce();

    const result = await checkoutOk(customer);
    await harness.deliverWebhook(result.payment.providerReference, 'FAILED');

    const cleanup = await onlyCleanupJob(result.order.id);
    expect(await runJob(cleanup.id)).toEqual({ outcome: 'succeeded' });
    expect(await cartLines(customer)).toEqual([
      { id: line, offerId: offer.offerId, quantity: 3, revision: 0 },
    ]);
  });

  it('preserves the cart when the provider definitively refuses the charge (checkout fails)', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const line = await addToCart(customer, offer, 1);
    jest
      .spyOn(harness.provider, 'initialize')
      .mockRejectedValueOnce(new BadRequestException('Card number invalid'));

    await postCheckout(customer, {}, randomUUID()).expect(400);

    const order = await harness.prisma.order.findFirstOrThrow({
      where: { userId: customer.userId },
      select: { id: true, status: true, payment: true },
    });
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.payment?.status).toBe(PaymentStatus.FAILED);
    const cleanup = await onlyCleanupJob(order.id);
    expect(await runJob(cleanup.id)).toEqual({ outcome: 'succeeded' });
    expect(await cartLines(customer)).toEqual([
      { id: line, offerId: offer.offerId, quantity: 1, revision: 0 },
    ]);
  });

  it('retries without deleting while the payment is unresolved, then cleans up once confirmPayment settles it', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const line = await addToCart(customer, offer, 2);
    jest
      .spyOn(harness.provider, 'initialize')
      .mockRejectedValueOnce(new PaymentOutcomeUnknownException());

    // The ambiguous gateway outcome still answers with the pending payment.
    const result = await checkoutOk(customer);
    expect(result.payment.status).toBe('PENDING');
    const payment = await harness.prisma.payment.findUniqueOrThrow({
      where: { id: result.payment.id },
    });
    expect(payment.providerReference).toBeNull();
    // The inline cleanup refused too: the charge may or may not have happened.
    expect(await cartLines(customer)).toHaveLength(1);

    const cleanup = await onlyCleanupJob(result.order.id);
    for (const attempt of [1, 2]) {
      const run = await runJob(cleanup.id);
      expect(run.outcome).toBe('failed');
      expect(await job(cleanup.id)).toMatchObject({
        status: BackgroundJobStatus.PENDING,
        attempts: attempt,
        lastError: `Payment for order ${result.order.id} awaits reconciliation before cart cleanup`,
      });
      expect(await cartLines(customer)).toEqual([
        { id: line, offerId: offer.offerId, quantity: 2, revision: 0 },
      ]);
    }

    // Reconciliation resolves it as paid (operator-recorded outcome), and
    // confirmPayment applies the order side, enqueueing its own cleanup.
    await harness.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.SUCCEEDED },
    });
    await ordersService.confirmPayment(result.order.id);
    const all = await cleanupJobs(result.order.id);
    expect(all).toHaveLength(2);

    expect(await runJob(cleanup.id)).toEqual({ outcome: 'succeeded' });
    expect(await cartLines(customer)).toEqual([]);
    const fromConfirm = all.find((row) => row.id !== cleanup.id)!;
    expect(await runJob(fromConfirm.id)).toEqual({ outcome: 'succeeded' });
    expect(await cartLines(customer)).toEqual([]);
  });

  it('never fails the checkout response when the inline cleanup throws, and the attempt replays the success', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    await addToCart(customer, offer, 1);
    const key = randomUUID();
    failInlineCleanupOnce();

    const result = await checkoutOk(customer, {}, key);

    const attempt = await harness.prisma.checkoutAttempt.findFirstOrThrow({
      where: { userId: customer.userId },
    });
    expect(attempt.status).toBe('COMPLETED');
    expect(attempt.orderId).toBe(result.order.id);
    const replay = await checkoutOk(customer, {}, key);
    expect(replay.order.id).toBe(result.order.id);
    expect(await cartLines(customer)).toHaveLength(1);
    expect(await onlyCleanupJob(result.order.id)).toMatchObject({
      status: BackgroundJobStatus.PENDING,
    });
  });

  it('never fails the checkout response when the cleanup enqueue of an inline-settled payment fails', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    await addToCart(customer, offer, 2);
    jest.spyOn(harness.provider, 'initialize').mockImplementationOnce((input) =>
      Promise.resolve({
        providerReference: `fake-ref-${input.paymentId}`,
        status: 'SUCCEEDED',
      }),
    );
    // The order transaction's own enqueue works; confirmPayment's (the
    // second cart cleanup enqueue of this checkout) fails.
    const enqueues = failCartCleanupEnqueue((attempt) => attempt === 2);

    const result = await checkoutOk(customer);

    expect(enqueues.cartCleanupCalls()).toBe(2);
    // The settlement could not be applied, so it awaits reconciliation;
    // the response is still the created order and its submitted payment.
    expect(result.payment.status).toBe('PENDING');
    expect(
      (result.payment as { requiresReconciliation?: boolean })
        .requiresReconciliation,
    ).toBe(true);
    expect(await cartLines(customer)).toEqual([]);
    expect(await onlyCleanupJob(result.order.id)).toMatchObject({
      status: BackgroundJobStatus.PENDING,
    });
  });

  it('rolls the whole checkout back when the order transaction cannot enqueue its cleanup job', async () => {
    // Contract §2 step 6 makes the job part of the order transaction, so a
    // failed enqueue cannot leave an order without its durable cleanup: the
    // order is never created and the request is retryable.
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const line = await addToCart(customer, offer, 2);
    const initialize = jest.spyOn(harness.provider, 'initialize');
    const failing = failCartCleanupEnqueue(() => true);
    const key = randomUUID();

    const response = await postCheckout(customer, {}, key);

    expect(response.status).toBe(500);
    expect(initialize).not.toHaveBeenCalled();
    expect(
      await harness.prisma.order.count({ where: { userId: customer.userId } }),
    ).toBe(0);
    expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 0 });
    expect(await cartLines(customer)).toEqual([
      { id: line, offerId: offer.offerId, quantity: 2, revision: 0 },
    ]);

    // The same key retries cleanly once the queue is back.
    failing.spy.mockRestore();
    const retried = await checkoutOk(customer, {}, key);
    expect(retried.payment.status).toBe('PENDING');
    expect(await cartLines(customer)).toEqual([]);
    expect(await onlyCleanupJob(retried.order.id)).toBeDefined();
  });

  it('completes a legacy job payload (itemIds only) without deleting anything', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const line = await addToCart(customer, offer, 2);
    const legacy = await jobs.enqueue({
      type: CART_CLEANUP_JOB_TYPE,
      payload: { userId: customer.userId, itemIds: [line] },
    });
    const wholeCart = await jobs.enqueue({
      type: CART_CLEANUP_JOB_TYPE,
      payload: { userId: customer.userId },
    });
    try {
      expect(await runJob(legacy.id)).toEqual({ outcome: 'succeeded' });
      expect(await runJob(wholeCart.id)).toEqual({ outcome: 'succeeded' });
      expect(await job(legacy.id)).toMatchObject({
        status: BackgroundJobStatus.SUCCEEDED,
      });
      expect(await cartLines(customer)).toEqual([
        { id: line, offerId: offer.offerId, quantity: 2, revision: 0 },
      ]);
    } finally {
      // Not keyed by orderId, so the harness cleanup would miss them.
      await harness.prisma.backgroundJob.deleteMany({
        where: { id: { in: [legacy.id, wholeCart.id] } },
      });
    }
  });

  it('retries while an order awaits its payment row, and completes without deleting once the order is cancelled', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const line = await addToCart(customer, offer, 2);
    // A non-HTTP failure before the payment row exists: the keyed attempt is
    // released (not definite), so the order stays PENDING_PAYMENT unpaid.
    const validate = jest.fn((): void => {
      throw new Error('provider configuration missing (injected)');
    });
    (harness.provider as { validateInput?: () => void }).validateInput =
      validate;
    try {
      await postCheckout(customer, {}, randomUUID()).expect(500);
    } finally {
      delete (harness.provider as { validateInput?: () => void }).validateInput;
    }
    expect(validate).toHaveBeenCalledTimes(1);

    const order = await harness.prisma.order.findFirstOrThrow({
      where: { userId: customer.userId },
      select: { id: true, status: true, payment: true },
    });
    expect(order).toMatchObject({
      status: OrderStatus.PENDING_PAYMENT,
      payment: null,
    });
    const cleanup = await onlyCleanupJob(order.id);
    const pending = await runJob(cleanup.id);
    expect(pending.outcome).toBe('failed');
    expect(await job(cleanup.id)).toMatchObject({
      status: BackgroundJobStatus.PENDING,
      lastError: `Payment for order ${order.id} is not yet recorded`,
    });

    // The order is given up (e.g. its reservations expired) with no payment.
    await ordersService.cancel(order.id);

    expect(await runJob(cleanup.id)).toEqual({ outcome: 'succeeded' });
    expect(await job(cleanup.id)).toMatchObject({
      status: BackgroundJobStatus.SUCCEEDED,
      attempts: 2,
    });
    expect(await cartLines(customer)).toEqual([
      { id: line, offerId: offer.offerId, quantity: 2, revision: 0 },
    ]);
  });

  it('completes without deleting when a definite pre-payment refusal cancelled the order (no payment row)', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const line = await addToCart(customer, offer, 1);
    (harness.provider as { validateInput?: () => void }).validateInput =
      (): void => {
        throw new BadRequestException('Unsupported payment method');
      };
    try {
      await postCheckout(customer).expect(400);
    } finally {
      delete (harness.provider as { validateInput?: () => void }).validateInput;
    }

    const order = await harness.prisma.order.findFirstOrThrow({
      where: { userId: customer.userId },
      select: { id: true, status: true, payment: true },
    });
    expect(order).toMatchObject({
      status: OrderStatus.CANCELLED,
      payment: null,
    });
    const cleanup = await onlyCleanupJob(order.id);
    expect(await runJob(cleanup.id)).toEqual({ outcome: 'succeeded' });
    expect(await job(cleanup.id)).toMatchObject({
      status: BackgroundJobStatus.SUCCEEDED,
      attempts: 1,
    });
    expect(await cartLines(customer)).toEqual([
      { id: line, offerId: offer.offerId, quantity: 1, revision: 0 },
    ]);
  });
});
