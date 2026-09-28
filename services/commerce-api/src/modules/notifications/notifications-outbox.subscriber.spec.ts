import { NotificationChannel, type OutboxEvent } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { NotificationsOutboxSubscriber } from './notifications-outbox.subscriber';
import { NotificationsService } from './notifications.service';
import { NotificationType } from './notifications.types';

const ORDER_ID = '0f8c2d1e-aaaa-4bbb-8ccc-000000000001';

function event(overrides: Partial<OutboxEvent>): OutboxEvent {
  return {
    id: 'event-1',
    topic: 'order.paid',
    aggregateType: 'Order',
    aggregateId: ORDER_ID,
    payload: { orderId: ORDER_ID },
    status: 'PENDING',
    attempts: 0,
    maxAttempts: 10,
    availableAt: new Date(),
    publishedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as OutboxEvent;
}

describe('NotificationsOutboxSubscriber', () => {
  let prisma: {
    order: { findUnique: jest.Mock };
    fulfillmentOrder: { findUnique: jest.Mock };
    shipment: { findUnique: jest.Mock };
  };
  let notifications: { create: jest.Mock };
  let subscriber: NotificationsOutboxSubscriber;

  beforeEach(() => {
    prisma = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: ORDER_ID, userId: 'customer-1' }),
      },
      fulfillmentOrder: { findUnique: jest.fn() },
      shipment: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    notifications = { create: jest.fn().mockResolvedValue({ id: 'n-1' }) };
    subscriber = new NotificationsOutboxSubscriber(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it('confirms a paid order to its customer, by email too', async () => {
    await subscriber.handle(event({}));

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'customer-1',
        type: NotificationType.ORDER_CONFIRMED,
        link: `/orders/${ORDER_ID}`,
        channels: [NotificationChannel.EMAIL],
      }),
    );
  });

  it('derives the dedupe key from the event, so a replay creates nothing new', async () => {
    await subscriber.handle(event({}));
    await subscriber.handle(event({}));

    const keys = notifications.create.mock.calls.map(
      ([input]: [{ dedupeKey: string }]) => input.dedupeKey,
    );
    expect(keys).toEqual([
      'event-1:order.confirmed:customer-1',
      'event-1:order.confirmed:customer-1',
    ]);
  });

  it('tells the customer a failed payment cancelled the order', async () => {
    await subscriber.handle(
      event({
        topic: 'payment.failed',
        aggregateType: 'Payment',
        aggregateId: 'payment-1',
        payload: {
          paymentId: 'payment-1',
          orderId: ORDER_ID,
          userId: 'customer-1',
          status: 'FAILED',
          reason: 'DECLINED',
        },
      }),
    );

    const [[input]] = notifications.create.mock.calls as [
      [{ type: string; userId: string; body: string }],
    ];
    expect(input.type).toBe(NotificationType.PAYMENT_FAILED);
    expect(input.userId).toBe('customer-1');
    expect(input.body).not.toContain('DECLINED');
  });

  it('notifies the seller who must accept a seller-fulfilled order, linking into the seller app', async () => {
    prisma.fulfillmentOrder.findUnique.mockResolvedValue({
      orderId: ORDER_ID,
      sellerOrderId: 'seller-order-1',
      fulfillmentNumber: 'FUL-1',
      warehouseId: null,
      sellerOrder: { seller: { ownerUserId: 'seller-user-1' } },
    });

    await subscriber.handle(
      event({
        topic: 'fulfillment.provisioned',
        aggregateType: 'FulfillmentOrder',
        aggregateId: 'fo-1',
        payload: {
          orderId: ORDER_ID,
          fulfillmentNumber: 'FUL-1',
          warehouseId: null,
        },
      }),
    );

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'seller-user-1',
        type: NotificationType.SELLER_ORDER_RECEIVED,
        link: '/orders/seller-order-1',
        body: expect.stringContaining('accept') as string,
      }),
    );
  });

  it('notifies no one for a first-party (sellerless) fulfillment order', async () => {
    prisma.fulfillmentOrder.findUnique.mockResolvedValue({
      orderId: ORDER_ID,
      sellerOrderId: 'seller-order-1',
      fulfillmentNumber: 'FUL-1',
      warehouseId: 'wh-1',
      sellerOrder: { seller: null },
    });

    await subscriber.handle(
      event({ topic: 'fulfillment.provisioned', aggregateId: 'fo-1' }),
    );

    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('includes the tracking reference when a dispatch has one', async () => {
    prisma.shipment.findUnique.mockResolvedValue({
      carrierCode: 'DHL',
      trackingReference: 'TRK123',
    });

    await subscriber.handle(
      event({
        topic: 'fulfillment.dispatched',
        aggregateType: 'FulfillmentDispatch',
        aggregateId: 'dispatch-1',
        payload: { orderId: ORDER_ID, shipmentId: 'shipment-1' },
      }),
    );

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.ORDER_DISPATCHED,
        body: expect.stringContaining('DHL TRK123') as string,
      }),
    );
  });

  it('skips, rather than throws on, an event whose order is gone', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(subscriber.handle(event({}))).resolves.toBeUndefined();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('propagates a storage failure so the dispatcher retries the event', async () => {
    notifications.create.mockRejectedValue(new Error('db down'));

    await expect(subscriber.handle(event({}))).rejects.toThrow('db down');
  });
});
