import request from 'supertest';

import {
  createCheckoutHarness,
  type CheckoutHarness,
} from './support/checkout-integration';

/**
 * Customer order cancellation (OrderCancellationService) against a real,
 * migrated Postgres database: the stock release, order/seller-order status,
 * audit row and `order.cancelled` outbox event commit together, and the
 * open payment is then marked CANCELLED through PaymentsService's own event
 * path.
 */
describe('Orders — customer cancel (integration, real Postgres)', () => {
  let harness: CheckoutHarness;

  beforeAll(async () => {
    harness = await createCheckoutHarness('orders-int');
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  it('cancels a PENDING_PAYMENT order, releasing its stock and cancelling its payment', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(6);
    const { order, payment } = await harness.checkout(customer, offer, 2);
    expect(await harness.stock(offer)).toEqual({ onHand: 6, reserved: 2 });

    const response = await request(harness.server())
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(customer.headers)
      .expect(200);
    expect((response.body as { data: { status: string } }).data.status).toBe(
      'CANCELLED',
    );

    const cancelled = await harness.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { sellerOrders: true, items: true, payment: true },
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.sellerOrders.map((group) => group.status)).toEqual([
      'CANCELLED',
    ]);
    expect(cancelled.payment?.status).toBe('CANCELLED');
    const reservation = await harness.prisma.reservation.findUniqueOrThrow({
      where: { id: cancelled.items[0]!.reservationId! },
    });
    expect(reservation.status).toBe('RELEASED');
    expect(await harness.stock(offer)).toEqual({ onHand: 6, reserved: 0 });

    const events = await harness.prisma.outboxEvent.findMany({
      where: { aggregateId: { in: [order.id, payment.id] } },
    });
    // The customer's own cancel is the order.cancelled notice; the payment
    // it cancelled does not add a second, payment.failed one.
    expect(events.map((event) => event.topic)).toEqual(['order.cancelled']);
    expect(events[0]).toMatchObject({
      aggregateType: 'Order',
      aggregateId: order.id,
      payload: { orderId: order.id, userId: customer.userId },
    });
    expect(
      await harness.prisma.auditEvent.count({
        where: {
          actorUserId: customer.userId,
          action: 'order.cancelled_by_customer',
          targetId: order.id,
        },
      }),
    ).toBe(1);

    // A retried cancel returns the order unchanged and records nothing new.
    await request(harness.server())
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(customer.headers)
      .expect(200);
    expect(
      await harness.prisma.outboxEvent.count({
        where: { aggregateId: { in: [order.id, payment.id] } },
      }),
    ).toBe(1);
    expect(await harness.stock(offer)).toEqual({ onHand: 6, reserved: 0 });
  });

  it("404s another customer's order and leaves it untouched", async () => {
    const owner = await harness.createCustomer();
    const stranger = await harness.createCustomer();
    const offer = await harness.createStockedOffer(3);
    const { order } = await harness.checkout(owner, offer, 1);

    await request(harness.server())
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(stranger.headers)
      .expect(404);

    expect(
      (
        await harness.prisma.order.findUniqueOrThrow({
          where: { id: order.id },
        })
      ).status,
    ).toBe('PENDING_PAYMENT');
    expect(await harness.stock(offer)).toEqual({ onHand: 3, reserved: 1 });
  });

  it('refuses to cancel a paid order (409), leaving the sale in place', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(3);
    const { order, payment } = await harness.checkout(customer, offer, 1);
    await harness.deliverWebhook(payment.providerReference, 'SUCCEEDED');

    await request(harness.server())
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(customer.headers)
      .expect(409);

    expect(
      (
        await harness.prisma.order.findUniqueOrThrow({
          where: { id: order.id },
        })
      ).status,
    ).toBe('PAID');
    expect(await harness.stock(offer)).toEqual({ onHand: 2, reserved: 0 });
  });
});
