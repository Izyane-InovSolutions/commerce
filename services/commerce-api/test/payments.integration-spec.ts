import request from 'supertest';

import { FULFILLMENT_PROVISION_JOB_TYPE } from '../src/modules/fulfillment/jobs/fulfillment-provision.handler';
import { PaymentsService } from '../src/modules/payments/payments.service';
import {
  createCheckoutHarness,
  type CheckoutHarness,
} from './support/checkout-integration';

/**
 * Payment outcomes against a real, migrated Postgres database: each outcome
 * is applied in one transaction with its dedupe record, the stock effect and
 * the outbox event (PaymentsService.applyEvent), under the order's row lock.
 * The gateway is FakePaymentProvider; outcomes arrive through the public
 * webhook route, or PaymentsService.expire for an abandoned payment.
 */
describe('Payments (integration, real Postgres)', () => {
  let harness: CheckoutHarness;

  beforeAll(async () => {
    harness = await createCheckoutHarness('payments-int');
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  function outboxTopics(aggregateIds: string[]): Promise<string[]> {
    return harness.prisma.outboxEvent
      .findMany({
        where: { aggregateId: { in: aggregateIds } },
        orderBy: { createdAt: 'asc' },
        select: { topic: true },
      })
      .then((rows) => rows.map((row) => row.topic));
  }

  it('confirms a paid order: commits the reservation, marks it PAID and emits order.paid once', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10);
    const { order, payment } = await harness.checkout(customer, offer, 4);

    await harness.deliverWebhook(payment.providerReference, 'SUCCEEDED');

    const paid = await harness.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { sellerOrders: true, items: true, payment: true },
    });
    expect(paid.status).toBe('PAID');
    expect(paid.sellerOrders.map((group) => group.status)).toEqual(['PAID']);
    expect(paid.payment?.status).toBe('SUCCEEDED');
    const reservation = await harness.prisma.reservation.findUniqueOrThrow({
      where: { id: paid.items[0]!.reservationId! },
    });
    expect(reservation.status).toBe('COMMITTED');
    expect(await harness.stock(offer)).toEqual({ onHand: 6, reserved: 0 });
    expect(
      await harness.prisma.paymentEvent.count({
        where: { paymentId: payment.id },
      }),
    ).toBe(1);
    expect(await outboxTopics([order.id, payment.id])).toEqual(['order.paid']);
    // Provisioning is its own job, written in the same transaction.
    expect(
      await harness.prisma.backgroundJob.count({
        where: {
          type: FULFILLMENT_PROVISION_JOB_TYPE,
          payload: { path: ['orderId'], equals: order.id },
        },
      }),
    ).toBe(1);

    // A second success for an already settled payment changes nothing.
    await harness.deliverWebhook(payment.providerReference, 'SUCCEEDED');
    expect(await harness.stock(offer)).toEqual({ onHand: 6, reserved: 0 });
    expect(await outboxTopics([order.id, payment.id])).toEqual(['order.paid']);
  });

  it('releases the reservation and cancels the order when the gateway reports a failure', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(5);
    const { order, payment } = await harness.checkout(customer, offer, 2);
    expect(await harness.stock(offer)).toEqual({ onHand: 5, reserved: 2 });

    await harness.deliverWebhook(payment.providerReference, 'FAILED');

    const cancelled = await harness.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { sellerOrders: true, items: true, payment: true },
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.sellerOrders.map((group) => group.status)).toEqual([
      'CANCELLED',
    ]);
    expect(cancelled.payment?.status).toBe('FAILED');
    const reservation = await harness.prisma.reservation.findUniqueOrThrow({
      where: { id: cancelled.items[0]!.reservationId! },
    });
    expect(reservation.status).toBe('RELEASED');
    expect(await harness.stock(offer)).toEqual({ onHand: 5, reserved: 0 });

    const events = await harness.prisma.outboxEvent.findMany({
      where: { aggregateId: { in: [order.id, payment.id] } },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      topic: 'payment.failed',
      aggregateType: 'Payment',
      aggregateId: payment.id,
      payload: expect.objectContaining({
        orderId: order.id,
        userId: customer.userId,
        status: 'FAILED',
      }) as object,
    });

    // A success arriving after the local cancellation is refused, not applied.
    harness.provider.queueEvent(payment.providerReference, 'SUCCEEDED');
    await request(harness.server())
      .post('/api/v1/payments/webhook')
      .set('x-webhook-signature', 'fake-signature')
      .send({ providerReference: payment.providerReference })
      .expect(409);
    expect(await harness.stock(offer)).toEqual({ onHand: 5, reserved: 0 });
  });

  it('expires an abandoned payment once, releasing its stock', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(4);
    const { order, payment } = await harness.checkout(customer, offer, 1);
    const payments = harness.app.get(PaymentsService);
    const row = await harness.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });

    const expired = await payments.expire(row, 'Payment window elapsed');
    expect(expired.status).toBe('CANCELLED');
    // Expiring again (a retried sweep) is a no-op.
    await payments.expire(row, 'Payment window elapsed');

    const cancelled = await harness.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(cancelled.status).toBe('CANCELLED');
    const reservation = await harness.prisma.reservation.findUniqueOrThrow({
      where: { id: cancelled.items[0]!.reservationId! },
    });
    expect(reservation.status).toBe('RELEASED');
    expect(await harness.stock(offer)).toEqual({ onHand: 4, reserved: 0 });
    expect(
      await harness.prisma.paymentEvent.count({
        where: { paymentId: payment.id },
      }),
    ).toBe(1);
    expect(await outboxTopics([order.id, payment.id])).toEqual([
      'payment.failed',
    ]);
  });
});
