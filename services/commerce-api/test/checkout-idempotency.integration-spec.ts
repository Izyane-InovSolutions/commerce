import { randomUUID } from 'node:crypto';

import { HttpException, HttpStatus } from '@nestjs/common';
import type { CheckoutAttempt } from '@prisma/client';
import type { Response } from 'supertest';

import { CheckoutAttemptsService } from '../src/modules/checkout/checkout-attempts.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { OrdersService } from '../src/modules/orders/orders.service';
import { PaymentOutcomeUnknownException } from '../src/modules/payments/gateway-errors';
import { PaymentsService } from '../src/modules/payments/payments.service';
import {
  deferred,
  holdLock,
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
 * Keyed checkout retries and crash boundaries against a real, migrated
 * Postgres database (CheckoutAttemptsService). Interleavings are forced with
 * explicit barriers — a provider call that waits on a test-controlled
 * promise, a row lock held open in a test transaction, and waiting for the
 * competing request to be seen blocked in pg_stat_activity — never sleeps.
 * A crash is a step made to throw (or a lease moved into the past, which is
 * what a dead process leaves behind).
 */
describe('Checkout idempotency and crash boundaries (integration, real Postgres)', () => {
  let harness: CheckoutHarness;
  let attempts: CheckoutAttemptsService;
  let inventory: InventoryService;
  let orders: OrdersService;
  let payments: PaymentsService;

  beforeAll(async () => {
    harness = await createCheckoutHarness('checkout-idem');
    attempts = harness.app.get(CheckoutAttemptsService);
    inventory = harness.app.get(InventoryService);
    orders = harness.app.get(OrdersService);
    payments = harness.app.get(PaymentsService);
  });

  beforeEach(() => harness.provider.reset());

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await harness.cleanup();
  });

  type ErrorBody = {
    error: {
      code: string;
      message: string;
      details: { field?: string; message: string }[];
    };
  };

  type CheckoutData = {
    order: { id: string; status: string; checkoutCartSnapshot?: unknown };
    payment: {
      id: string;
      status: string;
      providerReference: string | null;
      redirectUrl?: string;
      requiresReconciliation?: boolean;
    };
  };

  function data(response: Response): CheckoutData {
    return (response.body as { data: CheckoutData }).data;
  }

  /** The `data` member exactly as it appeared on the wire. */
  function dataText(response: Response): string {
    return JSON.stringify((response.body as { data: unknown }).data);
  }

  function errorOf(response: Response): ErrorBody['error'] {
    return (response.body as ErrorBody).error;
  }

  function detail(response: Response, field: string): string | undefined {
    return errorOf(response)?.details?.find((entry) => entry.field === field)
      ?.message;
  }

  function attemptCode(response: Response): string | undefined {
    return detail(response, 'code');
  }

  function attemptFor(
    customer: Customer,
    key: string,
  ): Promise<CheckoutAttempt> {
    return harness.prisma.checkoutAttempt.findUniqueOrThrow({
      where: { userId_key: { userId: customer.userId, key } },
    });
  }

  function orderCount(customer: Customer): Promise<number> {
    return harness.prisma.order.count({ where: { userId: customer.userId } });
  }

  function paymentCount(customer: Customer): Promise<number> {
    return harness.prisma.payment.count({
      where: { order: { userId: customer.userId } },
    });
  }

  function reservationCount(offer: StockedOffer): Promise<number> {
    return harness.prisma.reservation.count({
      where: { inventoryRecordId: offer.inventoryRecordId },
    });
  }

  function providerCalls(): number {
    return harness.provider.initializeCalls.length;
  }

  /** A lease in the past: what an owner that died mid-request leaves behind. */
  async function lapseLease(
    attemptId: string,
    ownerToken: string | null = randomUUID(),
  ): Promise<void> {
    await harness.prisma.checkoutAttempt.update({
      where: { id: attemptId },
      data: {
        ownerToken,
        leaseExpiresAt: ownerToken ? new Date(Date.now() - 1_000) : null,
      },
    });
  }

  async function expireReservations(orderId: string): Promise<void> {
    const items = await harness.prisma.orderItem.findMany({
      where: { orderId },
      select: { reservationId: true },
    });
    await harness.prisma.reservation.updateMany({
      where: {
        id: { in: items.flatMap((item) => item.reservationId ?? []) },
      },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
  }

  function spyRecordFailure(): jest.SpyInstance {
    return jest.spyOn(
      attempts as unknown as { recordFailure(): Promise<void> },
      'recordFailure',
    );
  }

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

  describe('concurrent requests and recorded outcomes', () => {
    it('admits exactly one of three simultaneous requests with one key, then replays its response byte for byte', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      const entered = deferred();
      const gate = deferred();
      harness.provider.scriptInitialize(async (input) => {
        entered.resolve();
        await gate.promise;
        return harness.provider.accepted(input);
      });

      const requests = [1, 2, 3].map(() =>
        track(harness.postCheckout(customer, key)),
      );
      await entered.promise;
      // The owner is parked inside the provider; the other two can only end
      // with a 409, and must do so without waiting for it.
      await waitUntil(
        () => requests.filter((tracked) => tracked.settled).length === 2,
        'the two non-owner requests have answered',
      );
      const losers = await Promise.all(
        requests
          .filter((tracked) => tracked.settled)
          .map((tracked) => tracked.promise),
      );
      for (const loser of losers) {
        expect(loser.status).toBe(409);
        expect(attemptCode(loser)).toBe('CHECKOUT_IN_PROGRESS');
      }

      gate.resolve();
      const owner = await requests.find((tracked) => !tracked.settled)!.promise;
      expect(owner.status).toBe(201);
      expect(data(owner).payment.redirectUrl).toBe(
        `https://fake-gateway.example/pay/${data(owner).payment.id}`,
      );

      expect(await orderCount(customer)).toBe(1);
      expect(await paymentCount(customer)).toBe(1);
      expect(await reservationCount(offer)).toBe(1);
      expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 2 });
      expect(providerCalls()).toBe(1);

      const attempt = await attemptFor(customer, key);
      expect(attempt).toMatchObject({
        status: 'COMPLETED',
        stage: 'FINISHED',
        orderId: data(owner).order.id,
        ownerToken: null,
        leaseExpiresAt: null,
      });

      const replays = [
        await harness.postCheckout(customer, key),
        await harness.postCheckout(customer, key),
      ];
      for (const replay of replays) {
        expect(replay.status).toBe(201);
        expect(dataText(replay)).toBe(dataText(owner));
      }
      expect(providerCalls()).toBe(1);
      expect(await orderCount(customer)).toBe(1);
      expect(await reservationCount(offer)).toBe(1);
    });

    it('records an insufficient-stock refusal as REJECTED and replays it, even after the stock comes back', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(5);
      await harness.addToCart(customer, offer, 3);
      const key = randomUUID();

      // The cart read sees 5 on hand; the stock drops to 2 while the
      // checkout waits for the record lock, so the reservation itself fails.
      const held = await holdLock(harness.prisma, (tx) =>
        tx.inventoryRecord.update({
          where: { id: offer.inventoryRecordId },
          data: { onHand: 2 },
        }),
      );
      const pending = track(harness.postCheckout(customer, key));
      await waitForLockWaiters(harness.prisma, held.pid);
      await held.release();
      const first = await pending.promise;

      expect(first.status).toBe(409);
      expect(errorOf(first).message).toBe('Insufficient available stock');
      expect(await attemptFor(customer, key)).toMatchObject({
        status: 'REJECTED',
        errorStatus: 409,
        orderId: null,
        ownerToken: null,
      });
      expect(await orderCount(customer)).toBe(0);
      expect(await reservationCount(offer)).toBe(0);

      await harness.prisma.inventoryRecord.update({
        where: { id: offer.inventoryRecordId },
        data: { onHand: 5 },
      });
      for (let retry = 0; retry < 2; retry++) {
        const replay = await harness.postCheckout(customer, key);
        expect(replay.status).toBe(409);
        expect(JSON.stringify(errorOf(replay))).toBe(
          JSON.stringify(errorOf(first)),
        );
      }
      expect(await orderCount(customer)).toBe(0);
      expect(await paymentCount(customer)).toBe(0);
      expect(providerCalls()).toBe(0);
    });

    it('records a definite provider decline as REJECTED, releases the stock, and never submits again', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(4);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      harness.provider.scriptInitialize(() =>
        Promise.reject(
          new HttpException(
            { message: 'Card was declined' },
            HttpStatus.PAYMENT_REQUIRED,
          ),
        ),
      );

      const first = await harness.postCheckout(customer, key);
      expect(first.status).toBe(402);
      expect(errorOf(first).message).toBe('Card was declined');

      const attempt = await attemptFor(customer, key);
      expect(attempt).toMatchObject({ status: 'REJECTED', errorStatus: 402 });
      const order = await harness.prisma.order.findUniqueOrThrow({
        where: { id: attempt.orderId! },
        include: { payment: true },
      });
      expect(order.status).toBe('CANCELLED');
      expect(order.payment?.status).toBe('FAILED');
      expect(await harness.stock(offer)).toEqual({ onHand: 4, reserved: 0 });

      const replay = await harness.postCheckout(customer, key);
      expect(replay.status).toBe(402);
      expect(JSON.stringify(errorOf(replay))).toBe(
        JSON.stringify(errorOf(first)),
      );
      expect(providerCalls()).toBe(1);
      expect(await orderCount(customer)).toBe(1);
      expect(await paymentCount(customer)).toBe(1);
    });

    it('refuses the key for a changed request body or the other checkout operation (CHECKOUT_KEY_REUSED)', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      const key = randomUUID();
      await harness.checkout(customer, offer, 1, key);

      const changed = [
        await harness.postCheckout(customer, key, { itemIds: [] }),
        await harness.postCheckout(customer, key, {
          paymentDetails: {
            paymentMethod: 'MOBILE_MONEY',
            phoneNumber: '0971234567',
          },
        }),
        await harness.postBuyNow(customer, offer, 1, key),
      ];
      for (const response of changed) {
        expect(response.status).toBe(409);
        expect(attemptCode(response)).toBe('CHECKOUT_KEY_REUSED');
      }
      expect(await orderCount(customer)).toBe(1);
      expect(providerCalls()).toBe(1);
      expect((await attemptFor(customer, key)).status).toBe('COMPLETED');
    });

    it('scopes a key to its user: two customers with the same key get independent checkouts', async () => {
      const offer = await harness.createStockedOffer(10);
      const buyers = [
        await harness.createCustomer(),
        await harness.createCustomer(),
      ];
      const key = randomUUID();

      const results = [];
      for (const buyer of buyers)
        results.push(await harness.checkout(buyer, offer, 1, key));
      expect(results[0]!.order.id).not.toBe(results[1]!.order.id);

      for (const [index, buyer] of buyers.entries()) {
        const replay = await harness.postCheckout(buyer, key);
        expect(replay.status).toBe(201);
        expect(data(replay).order.id).toBe(results[index]!.order.id);
        expect(await orderCount(buyer)).toBe(1);
        expect((await attemptFor(buyer, key)).orderId).toBe(
          results[index]!.order.id,
        );
      }
      expect(providerCalls()).toBe(2);
    });

    it('treats every keyless submit as a new checkout (the documented double-submit risk)', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);

      const first = await harness.postBuyNow(customer, offer, 1);
      const second = await harness.postBuyNow(customer, offer, 1);

      expect([first.status, second.status]).toEqual([201, 201]);
      expect(data(first).order.id).not.toBe(data(second).order.id);
      expect(await orderCount(customer)).toBe(2);
      expect(providerCalls()).toBe(2);
      expect(
        await harness.prisma.checkoutAttempt.count({
          where: { userId: customer.userId },
        }),
      ).toBe(0);
    });

    it('never persists payment details or the cart snapshot in the replayable receipt', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 1);
      const cardKey = randomUUID();
      const card = {
        paymentMethod: 'CARD',
        card: {
          number: '4111111111111111',
          expiryMonth: '12',
          expiryYear: '2031',
          securityCode: '123',
          holderName: 'Integration Buyer',
          billing: {
            firstName: 'Integration',
            lastName: 'Buyer',
            address1: '1 Cairo Road',
            locality: 'Lusaka',
            administrativeArea: 'Lusaka',
            postalCode: '10101',
            country: 'ZM',
            email: 'buyer@example.test',
          },
        },
      };
      const cardCheckout = await harness.postCheckout(customer, cardKey, {
        paymentDetails: card,
      });
      expect(cardCheckout.status).toBe(201);

      const mobileKey = randomUUID();
      const mobile = {
        paymentMethod: 'MOBILE_MONEY',
        phoneNumber: '0971234567',
      };
      const mobileCheckout = await harness.postBuyNow(
        customer,
        offer,
        1,
        mobileKey,
        { paymentDetails: mobile },
      );
      expect(mobileCheckout.status).toBe(201);

      // The cart order really carries a snapshot; it just never leaves the row.
      const cartOrder = await harness.prisma.order.findUniqueOrThrow({
        where: { id: data(cardCheckout).order.id },
        select: { checkoutCartSnapshot: true },
      });
      expect(Array.isArray(cartOrder.checkoutCartSnapshot)).toBe(true);

      for (const [key, response] of [
        [cardKey, cardCheckout],
        [mobileKey, mobileCheckout],
      ] as const) {
        const attempt = await attemptFor(customer, key);
        expect(attempt.status).toBe('COMPLETED');
        const stored = JSON.stringify(attempt);
        const sent = response.text;
        for (const text of [stored, sent]) {
          expect(text).not.toContain('4111111111111111');
          expect(text).not.toContain('securityCode');
          expect(text).not.toContain('holderName');
          expect(text).not.toContain('0971234567');
          expect(text).not.toContain('phoneNumber');
          expect(text).not.toContain('paymentDetails');
          expect(text).not.toContain('checkoutCartSnapshot');
        }
        expect(attempt.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      }

      // The same details still identify the request: both keys replay.
      const cardReplay = await harness.postCheckout(customer, cardKey, {
        paymentDetails: card,
      });
      expect(cardReplay.status).toBe(201);
      expect(dataText(cardReplay)).toBe(dataText(cardCheckout));
      const mobileReplay = await harness.postBuyNow(
        customer,
        offer,
        1,
        mobileKey,
        { paymentDetails: mobile },
      );
      expect(mobileReplay.status).toBe(201);
      expect(dataText(mobileReplay)).toBe(dataText(mobileCheckout));
      expect(providerCalls()).toBe(2);
    });
  });

  describe('legacy receipts', () => {
    function createLegacyOrder(
      customer: Customer,
      idempotencyKey: string | null,
    ): Promise<{ id: string }> {
      return harness.prisma.order.create({
        data: {
          userId: customer.userId,
          currency: 'ZMW',
          subtotal: 2_500,
          total: 2_500,
          shippingAddress: {},
          idempotencyKey,
        },
        select: { id: true },
      });
    }

    it('refuses a key already on a pre-receipt order, in any letter case, without touching payments', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 1);
      const sameCase = randomUUID();
      const otherCase = randomUUID();
      const sameCaseOrder = await createLegacyOrder(customer, sameCase);
      const otherCaseOrder = await createLegacyOrder(
        customer,
        otherCase.toUpperCase(),
      );

      for (const [header, orderId] of [
        [sameCase, sameCaseOrder.id],
        [sameCase.toUpperCase(), sameCaseOrder.id],
        [otherCase, otherCaseOrder.id],
        [otherCase.toUpperCase(), otherCaseOrder.id],
      ] as const) {
        const response = await harness.postCheckout(customer, header);
        expect(response.status).toBe(409);
        expect(attemptCode(response)).toBe('CHECKOUT_KEY_LEGACY_RECEIPT');
        expect(detail(response, 'orderId')).toBe(orderId);
      }

      expect(await orderCount(customer)).toBe(2);
      expect(await paymentCount(customer)).toBe(0);
      expect(providerCalls()).toBe(0);
      expect(
        await harness.prisma.checkoutAttempt.count({
          where: { userId: customer.userId },
        }),
      ).toBe(0);
    });

    it('refuses a draft-era attempt with no fingerprint metadata, including one stored in another letter case', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 1);
      const draftOrder = await createLegacyOrder(customer, null);
      const completedKey = randomUUID();
      await harness.prisma.checkoutAttempt.create({
        data: {
          userId: customer.userId,
          key: completedKey,
          operation: 'cart',
          fingerprint: 'a'.repeat(64),
          status: 'COMPLETED',
          stage: 'FINISHED',
          orderId: draftOrder.id,
          response: { order: { id: draftOrder.id } },
          completedAt: new Date(),
        },
      });
      const upperKey = randomUUID();
      await harness.prisma.checkoutAttempt.create({
        data: {
          userId: customer.userId,
          key: upperKey.toUpperCase(),
          operation: 'cart',
          fingerprint: 'b'.repeat(64),
          status: 'REJECTED',
          stage: 'FINISHED',
          response: { message: 'Cart is empty' },
          errorStatus: 409,
          completedAt: new Date(),
        },
      });

      const completed = await harness.postCheckout(customer, completedKey);
      expect(completed.status).toBe(409);
      expect(attemptCode(completed)).toBe('CHECKOUT_KEY_LEGACY_RECEIPT');
      expect(detail(completed, 'orderId')).toBe(draftOrder.id);

      const upper = await harness.postCheckout(customer, upperKey);
      expect(upper.status).toBe(409);
      expect(attemptCode(upper)).toBe('CHECKOUT_KEY_LEGACY_RECEIPT');

      expect(await orderCount(customer)).toBe(1);
      expect(await paymentCount(customer)).toBe(0);
      expect(providerCalls()).toBe(0);
      // No receipt was minted under the lowercased form of the draft key.
      expect(
        await harness.prisma.checkoutAttempt.count({
          where: { userId: customer.userId },
        }),
      ).toBe(2);
    });

    it('refuses an attempt fingerprinted with a key no longer in the ring', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 1);
      const key = randomUUID();
      await harness.prisma.checkoutAttempt.create({
        data: {
          userId: customer.userId,
          key,
          operation: 'cart',
          fingerprint: 'c'.repeat(64),
          fingerprintKeyId: 'retired-key',
          fingerprintVersion: 1,
          status: 'IN_PROGRESS',
          stage: 'RECEIVED',
        },
      });

      const response = await harness.postCheckout(customer, key);
      expect(response.status).toBe(409);
      expect(attemptCode(response)).toBe('CHECKOUT_KEY_LEGACY_RECEIPT');
      // Never claimed, never executed.
      expect(await attemptFor(customer, key)).toMatchObject({
        status: 'IN_PROGRESS',
        ownerToken: null,
        orderId: null,
      });
      expect(await orderCount(customer)).toBe(0);
      expect(providerCalls()).toBe(0);
    });
  });

  describe('crash boundaries', () => {
    it('(1) a failure inside the order transaction releases the attempt; the retry creates exactly one order', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      jest
        .spyOn(inventory, 'lockStockPools')
        .mockRejectedValueOnce(
          new Error('simulated crash inside the order transaction'),
        );

      const failed = await harness.postCheckout(customer, key);
      expect(failed.status).toBe(500);
      // The order link rolled back with the order; the owner let go.
      expect(await attemptFor(customer, key)).toMatchObject({
        status: 'IN_PROGRESS',
        stage: 'RECEIVED',
        orderId: null,
        ownerToken: null,
        leaseExpiresAt: null,
      });
      expect(await orderCount(customer)).toBe(0);
      expect(await reservationCount(offer)).toBe(0);

      const retry = await harness.postCheckout(customer, key);
      expect(retry.status).toBe(201);
      expect(await orderCount(customer)).toBe(1);
      expect(await reservationCount(offer)).toBe(1);
      expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 2 });
      expect(providerCalls()).toBe(1);
      expect((await attemptFor(customer, key)).status).toBe('COMPLETED');
    });

    it('(1) an owner that died before the order committed is taken over once its lease lapses', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      jest
        .spyOn(inventory, 'lockStockPools')
        .mockRejectedValueOnce(
          new Error('simulated crash inside the order transaction'),
        );
      // The process "dies" before it can record anything about the attempt.
      spyRecordFailure().mockRejectedValueOnce(new Error('process died'));

      expect((await harness.postCheckout(customer, key)).status).toBe(500);
      const orphaned = await attemptFor(customer, key);
      expect(orphaned).toMatchObject({ status: 'IN_PROGRESS', orderId: null });
      expect(orphaned.ownerToken).not.toBeNull();

      // While the dead owner's lease is live, a retry must wait.
      const early = await harness.postCheckout(customer, key);
      expect(early.status).toBe(409);
      expect(attemptCode(early)).toBe('CHECKOUT_IN_PROGRESS');

      await lapseLease(orphaned.id, orphaned.ownerToken);
      const retry = await harness.postCheckout(customer, key);
      expect(retry.status).toBe(201);
      expect(await orderCount(customer)).toBe(1);
      expect(await reservationCount(offer)).toBe(1);
      expect(providerCalls()).toBe(1);
    });

    it('(2) after the order commits but before the payment row exists, the retry resumes that order: one payment, one provider call', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      jest
        .spyOn(orders, 'lockForPayment')
        .mockRejectedValueOnce(
          new Error('simulated crash before the payment insert'),
        );

      expect((await harness.postCheckout(customer, key)).status).toBe(500);
      const interrupted = await attemptFor(customer, key);
      expect(interrupted).toMatchObject({
        status: 'IN_PROGRESS',
        stage: 'ORDER_CREATED',
      });
      const orderId = interrupted.orderId!;
      expect(orderId).toBeTruthy();
      expect(await paymentCount(customer)).toBe(0);
      expect(providerCalls()).toBe(0);
      const [reservation] = await harness.prisma.reservation.findMany({
        where: { inventoryRecordId: offer.inventoryRecordId },
      });

      // Emulate an owner that died rather than released: token kept, lease lapsed.
      await lapseLease(interrupted.id);
      const retry = await harness.postCheckout(customer, key);

      expect(retry.status).toBe(201);
      expect(data(retry).order.id).toBe(orderId);
      expect(data(retry).order.status).toBe('PENDING_PAYMENT');
      expect(await orderCount(customer)).toBe(1);
      expect(await paymentCount(customer)).toBe(1);
      expect(providerCalls()).toBe(1);
      // The resumed order kept its original reservation; nothing was re-reserved.
      expect(
        await harness.prisma.reservation.findMany({
          where: { inventoryRecordId: offer.inventoryRecordId },
        }),
      ).toEqual([expect.objectContaining({ id: reservation!.id })]);
      expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 2 });
      expect(await attemptFor(customer, key)).toMatchObject({
        status: 'COMPLETED',
        orderId,
      });
    });

    it('(3) after the provider accepted but the receipt write failed, the key is BLOCKED and the retry never re-submits', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      jest
        .spyOn(attempts, 'complete')
        .mockRejectedValueOnce(
          new Error('simulated crash before the receipt was recorded'),
        );

      expect((await harness.postCheckout(customer, key)).status).toBe(500);
      const attempt = await attemptFor(customer, key);
      expect(attempt.status).toBe('BLOCKED');
      const payment = await harness.prisma.payment.findUniqueOrThrow({
        where: { orderId: attempt.orderId! },
      });
      expect(payment.providerReference).toBe(`fake-ref-${payment.id}`);
      expect(providerCalls()).toBe(1);

      for (let retry = 0; retry < 2; retry++) {
        const response = await harness.postCheckout(customer, key);
        expect(response.status).toBe(409);
        expect(attemptCode(response)).toBe('CHECKOUT_REQUIRES_RECONCILIATION');
        expect(detail(response, 'orderId')).toBe(attempt.orderId);
        expect(detail(response, 'paymentId')).toBe(payment.id);
      }
      expect(providerCalls()).toBe(1);
      expect(await orderCount(customer)).toBe(1);
      expect(await paymentCount(customer)).toBe(1);
    });

    it('(3) a process that died after the provider accepted leaves a lease; the retry after it lapses blocks instead of re-submitting', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      jest
        .spyOn(attempts, 'complete')
        .mockRejectedValueOnce(
          new Error('simulated crash before the receipt was recorded'),
        );
      spyRecordFailure().mockRejectedValueOnce(new Error('process died'));

      expect((await harness.postCheckout(customer, key)).status).toBe(500);
      const orphaned = await attemptFor(customer, key);
      expect(orphaned).toMatchObject({
        status: 'IN_PROGRESS',
        stage: 'PAYMENT_STARTED',
      });
      const payment = await harness.prisma.payment.findUniqueOrThrow({
        where: { orderId: orphaned.orderId! },
      });

      const early = await harness.postCheckout(customer, key);
      expect(early.status).toBe(409);
      expect(attemptCode(early)).toBe('CHECKOUT_IN_PROGRESS');
      expect(detail(early, 'paymentId')).toBe(payment.id);

      await lapseLease(orphaned.id, orphaned.ownerToken);
      const retry = await harness.postCheckout(customer, key);
      expect(retry.status).toBe(409);
      expect(attemptCode(retry)).toBe('CHECKOUT_REQUIRES_RECONCILIATION');
      expect(detail(retry, 'orderId')).toBe(orphaned.orderId);
      expect(detail(retry, 'paymentId')).toBe(payment.id);
      expect((await attemptFor(customer, key)).status).toBe('BLOCKED');
      expect(providerCalls()).toBe(1);
      expect(await paymentCount(customer)).toBe(1);
    });

    it('(4) an unknown provider outcome completes with requiresReconciliation, and the replay never re-initializes', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      harness.provider.scriptInitialize(() =>
        Promise.reject(new PaymentOutcomeUnknownException()),
      );

      const first = await harness.postCheckout(customer, key);
      expect(first.status).toBe(201);
      expect(data(first).payment).toMatchObject({
        status: 'PENDING',
        requiresReconciliation: true,
      });
      expect(data(first).order.status).toBe('PENDING_PAYMENT');
      expect(await attemptFor(customer, key)).toMatchObject({
        status: 'COMPLETED',
      });
      // An ambiguous charge keeps the stock held.
      expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 2 });

      const replay = await harness.postCheckout(customer, key);
      expect(replay.status).toBe(201);
      expect(dataText(replay)).toBe(dataText(first));
      expect(data(replay).payment.requiresReconciliation).toBe(true);
      expect(providerCalls()).toBe(1);
      expect(await paymentCount(customer)).toBe(1);
    });

    it('(5) a resumed attempt whose reservations lapsed cancels the order and records CHECKOUT_EXPIRED without any payment', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 3);
      const key = randomUUID();
      jest
        .spyOn(orders, 'lockForPayment')
        .mockRejectedValueOnce(
          new Error('simulated crash before the payment insert'),
        );

      expect((await harness.postCheckout(customer, key)).status).toBe(500);
      const interrupted = await attemptFor(customer, key);
      const orderId = interrupted.orderId!;
      expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 3 });
      await expireReservations(orderId);
      await lapseLease(interrupted.id);

      const retry = await harness.postCheckout(customer, key);
      expect(retry.status).toBe(409);
      expect(attemptCode(retry)).toBe('CHECKOUT_EXPIRED');
      expect(detail(retry, 'orderId')).toBe(orderId);

      expect(await attemptFor(customer, key)).toMatchObject({
        status: 'REJECTED',
        errorStatus: 409,
        ownerToken: null,
      });
      expect(
        (
          await harness.prisma.order.findUniqueOrThrow({
            where: { id: orderId },
          })
        ).status,
      ).toBe('CANCELLED');
      expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 0 });
      expect(await paymentCount(customer)).toBe(0);
      expect(providerCalls()).toBe(0);

      const replay = await harness.postCheckout(customer, key);
      expect(replay.status).toBe(409);
      expect(JSON.stringify(errorOf(replay))).toBe(
        JSON.stringify(errorOf(retry)),
      );
      expect(await orderCount(customer)).toBe(1);
      expect(await paymentCount(customer)).toBe(0);
    });

    it('(6) a stale owner whose attempt was taken over creates no payment: the retry resumes the order alone', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      const paused = pauseNextPaymentInitialization();

      const stale = track(harness.postCheckout(customer, key));
      await paused.reached;
      // The stale owner's order is committed and linked; it stalls before
      // payment past its lease, and a retry takes the attempt over.
      const attempt = await attemptFor(customer, key);
      await lapseLease(attempt.id, attempt.ownerToken);
      const retry = await harness.postCheckout(customer, key);
      expect(retry.status).toBe(201);
      expect(data(retry).order.id).toBe(attempt.orderId);

      paused.proceed();
      const staleResponse = await stale.promise;
      expect(staleResponse.status).toBe(409);
      expect(attemptCode(staleResponse)).toBe('CHECKOUT_IN_PROGRESS');

      expect(await paymentCount(customer)).toBe(1);
      expect(providerCalls()).toBe(1);
      expect(await orderCount(customer)).toBe(1);
      expect(
        (
          await harness.prisma.order.findUniqueOrThrow({
            where: { id: attempt.orderId! },
          })
        ).status,
      ).toBe('PENDING_PAYMENT');
      const finished = await attemptFor(customer, key);
      expect(finished.status).toBe('COMPLETED');
      expect(
        (finished.response as { payment: { id: string } }).payment.id,
      ).toBe(data(retry).payment.id);
    });

    it('(6) a stale owner that wakes after the retry expired and cancelled its order cannot charge the cancelled order', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      const paused = pauseNextPaymentInitialization();

      const stale = track(harness.postCheckout(customer, key));
      await paused.reached;
      const attempt = await attemptFor(customer, key);
      await expireReservations(attempt.orderId!);
      await lapseLease(attempt.id, attempt.ownerToken);
      const retry = await harness.postCheckout(customer, key);
      expect(retry.status).toBe(409);
      expect(attemptCode(retry)).toBe('CHECKOUT_EXPIRED');

      paused.proceed();
      const staleResponse = await stale.promise;
      expect(staleResponse.status).toBe(409);
      expect(attemptCode(staleResponse)).toBe('CHECKOUT_IN_PROGRESS');

      expect(await paymentCount(customer)).toBe(0);
      expect(providerCalls()).toBe(0);
      expect(
        (
          await harness.prisma.order.findUniqueOrThrow({
            where: { id: attempt.orderId! },
          })
        ).status,
      ).toBe('CANCELLED');
      expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 0 });
      expect(await attemptFor(customer, key)).toMatchObject({
        status: 'REJECTED',
        errorStatus: 409,
      });
    });

    it('(6) a takeover cannot claim between the payment guard and the payment insert: the claim waits, then loses', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      const paused = pauseNextPaymentInitialization();

      const owner = track(harness.postCheckout(customer, key));
      await paused.reached;
      const attempt = await attemptFor(customer, key);
      // The owner overran its lease (as far as any retry can tell)...
      await lapseLease(attempt.id, attempt.ownerToken);
      // ...and is stopped after its guard, at the order lock, inside the
      // transaction that inserts the payment.
      const orderLock = await holdLock(
        harness.prisma,
        (tx) =>
          tx.$queryRaw`SELECT id FROM orders WHERE id = ${attempt.orderId}::uuid FOR UPDATE`,
      );
      paused.proceed();
      await waitForLockWaiters(harness.prisma, orderLock.pid);

      // The retry's compare-and-set claim needs the attempt row the guard
      // already updated, so it queues behind the owner's transaction.
      const claimer = track(harness.postCheckout(customer, key));
      await waitForLockWaiters(harness.prisma, orderLock.pid, { depth: 2 });
      await orderLock.release();

      const [ownerResponse, claimerResponse] = await Promise.all([
        owner.promise,
        claimer.promise,
      ]);
      expect(ownerResponse.status).toBe(201);
      expect(claimerResponse.status).toBe(409);
      expect(attemptCode(claimerResponse)).toBe('CHECKOUT_IN_PROGRESS');
      expect(detail(claimerResponse, 'paymentId')).toBe(
        data(ownerResponse).payment.id,
      );
      expect(await paymentCount(customer)).toBe(1);
      expect(providerCalls()).toBe(1);
      expect(await attemptFor(customer, key)).toMatchObject({
        status: 'COMPLETED',
        orderId: attempt.orderId,
      });
    });

    it('(7) a BLOCKED attempt whose payment FAILED and order was CANCELLED becomes REJECTED CHECKOUT_PAYMENT_FAILED', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      jest
        .spyOn(attempts, 'complete')
        .mockRejectedValueOnce(
          new Error('simulated crash before the receipt was recorded'),
        );
      expect((await harness.postCheckout(customer, key)).status).toBe(500);
      const blocked = await attemptFor(customer, key);
      expect(blocked.status).toBe('BLOCKED');
      const payment = await harness.prisma.payment.findUniqueOrThrow({
        where: { orderId: blocked.orderId! },
      });

      await harness.deliverWebhook(payment.providerReference!, 'FAILED');
      expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 0 });

      const first = await harness.postCheckout(customer, key);
      expect(first.status).toBe(409);
      expect(attemptCode(first)).toBe('CHECKOUT_PAYMENT_FAILED');
      expect(errorOf(first).message).toBe(
        'Payment was not accepted; start a new checkout with a new key',
      );
      expect(detail(first, 'orderId')).toBe(blocked.orderId);
      expect(detail(first, 'paymentId')).toBe(payment.id);
      expect(await attemptFor(customer, key)).toMatchObject({
        status: 'REJECTED',
        stage: 'FINISHED',
        errorStatus: 409,
      });

      const replay = await harness.postCheckout(customer, key);
      expect(replay.status).toBe(409);
      expect(JSON.stringify(errorOf(replay))).toBe(
        JSON.stringify(errorOf(first)),
      );
      expect(providerCalls()).toBe(1);
      expect(await orderCount(customer)).toBe(1);
      expect(await paymentCount(customer)).toBe(1);
    });

    it('(7) a BLOCKED attempt whose payment FAILED but whose order is still pending cancels it, restoring stock, then rejects', async () => {
      const customer = await harness.createCustomer();
      const offer = await harness.createStockedOffer(10);
      await harness.addToCart(customer, offer, 2);
      const key = randomUUID();
      jest
        .spyOn(attempts, 'complete')
        .mockRejectedValueOnce(
          new Error('simulated crash before the receipt was recorded'),
        );
      expect((await harness.postCheckout(customer, key)).status).toBe(500);
      const blocked = await attemptFor(customer, key);
      expect(blocked.status).toBe('BLOCKED');
      // The refusal was recorded on the payment, but the process died
      // before the order was cancelled.
      await harness.prisma.payment.update({
        where: { orderId: blocked.orderId! },
        data: { status: 'FAILED' },
      });

      const response = await harness.postCheckout(customer, key);
      expect(response.status).toBe(409);
      expect(attemptCode(response)).toBe('CHECKOUT_PAYMENT_FAILED');
      expect(
        (
          await harness.prisma.order.findUniqueOrThrow({
            where: { id: blocked.orderId! },
          })
        ).status,
      ).toBe('CANCELLED');
      expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 0 });
      expect((await attemptFor(customer, key)).status).toBe('REJECTED');
      expect(providerCalls()).toBe(1);
    });
  });
});
