import { randomUUID } from 'node:crypto';

import request from 'supertest';

import {
  createCheckoutHarness,
  type CheckoutHarness,
} from './support/checkout-integration';

/**
 * Checkout against a real, migrated Postgres database — the order, its
 * seller/shipping groups and the stock reservations are written in one
 * transaction (OrdersService.createOrderFromLines), which only a real
 * database can show rolling back as a unit. See
 * test/support/checkout-integration.ts for the harness.
 */
describe('Checkout (integration, real Postgres)', () => {
  let harness: CheckoutHarness;

  beforeAll(async () => {
    harness = await createCheckoutHarness('checkout-int');
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  it('creates a PENDING_PAYMENT order from the cart, reserving stock for every line', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(10, 2_500);

    const result = await harness.checkout(customer, offer, 3);

    expect(result.order.status).toBe('PENDING_PAYMENT');
    expect(result.order.items).toHaveLength(1);
    expect(result.payment).toMatchObject({
      status: 'PENDING',
      providerReference: `fake-ref-${result.payment.id}`,
    });

    const order = await harness.prisma.order.findUniqueOrThrow({
      where: { id: result.order.id },
      include: {
        items: true,
        sellerOrders: { include: { shippingGroups: true } },
      },
    });
    expect(order.subtotal).toBe(7_500);
    expect(order.total).toBe(order.subtotal + order.shippingAmount);
    expect(order.sellerOrders).toHaveLength(1);
    expect(order.sellerOrders[0]).toMatchObject({
      sellerId: null,
      status: 'PENDING_PAYMENT',
    });
    expect(order.sellerOrders[0]?.shippingGroups).toHaveLength(1);

    const item = order.items[0]!;
    expect(item.reservationId).not.toBeNull();
    const reservation = await harness.prisma.reservation.findUniqueOrThrow({
      where: { id: item.reservationId! },
    });
    expect(reservation).toMatchObject({
      inventoryRecordId: offer.inventoryRecordId,
      quantity: 3,
      status: 'ACTIVE',
      holderType: 'order_item',
      holderId: item.id,
    });
    expect(await harness.stock(offer)).toEqual({ onHand: 10, reserved: 3 });

    // Payment initialisation succeeded, so the checked-out lines leave the cart.
    const cart = await request(harness.server())
      .get('/api/v1/cart?currency=ZMW')
      .set(customer.headers)
      .expect(200);
    expect((cart.body as { data: { items: unknown[] } }).data.items).toEqual(
      [],
    );
  });

  it('replays a retried checkout with the same Idempotency-Key without reserving twice', async () => {
    const customer = await harness.createCustomer();
    const offer = await harness.createStockedOffer(5);
    const key = randomUUID();

    const first = await harness.checkout(customer, offer, 2, key);
    const replay = await request(harness.server())
      .post('/api/v1/checkout')
      .set(customer.headers)
      .set('Idempotency-Key', key)
      .send({ shippingAddressId: customer.addressId, currency: 'ZMW' })
      .expect(201);

    const replayed = (replay.body as { data: typeof first }).data;
    expect(replayed.order.id).toBe(first.order.id);
    expect(replayed.payment.id).toBe(first.payment.id);
    expect(
      await harness.prisma.order.count({ where: { userId: customer.userId } }),
    ).toBe(1);
    expect(await harness.stock(offer)).toEqual({ onHand: 5, reserved: 2 });
  });

  it('lets only one of two concurrent checkouts reserve the last units, rolling the other back whole', async () => {
    const offer = await harness.createStockedOffer(3);
    const buyers = [
      await harness.createCustomer(),
      await harness.createCustomer(),
    ];
    for (const buyer of buyers) {
      await request(harness.server())
        .post('/api/v1/cart/items?currency=ZMW')
        .set(buyer.headers)
        .send({ offerId: offer.offerId, quantity: 2 })
        .expect(201);
    }

    const responses = await Promise.all(
      buyers.map((buyer) =>
        request(harness.server())
          .post('/api/v1/checkout')
          .set(buyer.headers)
          .send({ shippingAddressId: buyer.addressId, currency: 'ZMW' }),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await harness.stock(offer)).toEqual({ onHand: 3, reserved: 2 });
    // The losing checkout left no order, seller order or reservation behind.
    expect(
      await harness.prisma.order.count({
        where: { userId: { in: buyers.map((buyer) => buyer.userId) } },
      }),
    ).toBe(1);
    expect(
      await harness.prisma.reservation.count({
        where: { inventoryRecordId: offer.inventoryRecordId },
      }),
    ).toBe(1);
    // The loser's cart is kept so they can adjust and retry.
    const loser = buyers[responses.findIndex((r) => r.status === 409)]!;
    const cart = await request(harness.server())
      .get('/api/v1/cart?currency=ZMW')
      .set(loser.headers)
      .expect(200);
    expect(
      (cart.body as { data: { items: unknown[] } }).data.items,
    ).toHaveLength(1);
  });
});
