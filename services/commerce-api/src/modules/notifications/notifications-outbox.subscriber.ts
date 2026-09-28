import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  type OutboxEvent,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import type { OutboxSubscriber } from '../../infrastructure/jobs/outbox-subscriber.interface';
import { NotificationsService } from './notifications.service';
import {
  NotificationType,
  type CreateNotificationInput,
} from './notifications.types';

/**
 * Topics turned into notifications. Written as literals rather than imported
 * from the emitting modules so this module depends on none of them; each
 * handler's docblock names the emitter and the payload fields it reads.
 *
 * Deliberately not subscribed: `shipment.booked` (always followed by
 * `fulfillment.dispatched`, which is the notice a customer wants),
 * `procurement.*` (internal purchasing, no customer or seller party) and
 * the review topics (moderated content, surfaced through the review flows).
 */
export const NOTIFICATION_TOPICS = [
  'order.paid',
  'payment.failed',
  'order.cancelled',
  'fulfillment.provisioned',
  'fulfillment.dispatched',
  'fulfillment.refund_required',
  'shipment.delivered',
] as const;

type Draft = Omit<CreateNotificationInput, 'dedupeKey'>;

// Every notification here also goes out by email; none is sent by SMS
// (no provider — see NotificationChannelSender).
const CHANNELS = [NotificationChannel.EMAIL];

/** Matches the storefront's and seller app's own short order reference. */
function orderRef(orderId: string): string {
  return orderId.slice(0, 8);
}

function readString(
  payload: Prisma.JsonValue,
  key: string,
): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return undefined;
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Turns domain events into customer and seller notifications.
 *
 * Idempotent as OutboxSubscriber requires: each notification's dedupeKey is
 * the event id plus its type and recipient, so a replayed event (the
 * dispatcher retries every subscriber when any one fails) creates nothing
 * new. Sending is left to NotificationDeliveryService's sweep, so a mail
 * outage never fails — and so never re-runs — an outbox event.
 *
 * An event whose payload or referenced rows can't be read is logged and
 * skipped rather than thrown: retrying can't repair it, and it would only
 * dead-letter the event after burning its attempts.
 */
@Injectable()
export class NotificationsOutboxSubscriber implements OutboxSubscriber {
  readonly name = 'notifications';
  readonly topics = NOTIFICATION_TOPICS;
  private readonly logger = new Logger(NotificationsOutboxSubscriber.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    const drafts = await this.draftsFor(event);
    for (const draft of drafts) {
      await this.notifications.create({
        ...draft,
        dedupeKey: `${event.id}:${draft.type}:${draft.userId}`,
      });
    }
  }

  private draftsFor(event: OutboxEvent): Promise<Draft[]> {
    switch (event.topic) {
      case 'order.paid':
        return this.orderPaid(event);
      case 'payment.failed':
        return this.paymentFailed(event);
      case 'order.cancelled':
        return this.orderCancelled(event);
      case 'fulfillment.provisioned':
        return this.fulfillmentProvisioned(event);
      case 'fulfillment.dispatched':
        return this.fulfillmentDispatched(event);
      case 'fulfillment.refund_required':
        return this.refundRequired(event);
      case 'shipment.delivered':
        return this.shipmentDelivered(event);
      default:
        return Promise.resolve([]);
    }
  }

  /** OrdersService.confirmPayment — `{ orderId }`. */
  private async orderPaid(event: OutboxEvent): Promise<Draft[]> {
    const order = await this.findOrder(
      event,
      readString(event.payload, 'orderId'),
    );
    if (!order) return [];
    return [
      {
        userId: order.userId,
        type: NotificationType.ORDER_CONFIRMED,
        title: 'Order confirmed',
        body: `We've received your payment for order ${orderRef(order.id)}. We'll let you know when it ships.`,
        link: `/orders/${order.id}`,
        channels: CHANNELS,
      },
    ];
  }

  /**
   * PaymentsService's provider-event handling — `{ paymentId, orderId,
   * userId, status, reason }`. Only emitted when the failure is what
   * cancelled the order, so the order is always cancelled by now. The
   * gateway's `reason` is not shown: it's written for operators.
   */
  private paymentFailed(event: OutboxEvent): Promise<Draft[]> {
    const orderId = readString(event.payload, 'orderId');
    const userId = readString(event.payload, 'userId');
    if (!orderId || !userId) return this.skip(event, 'orderId/userId');
    return Promise.resolve([
      {
        userId,
        type: NotificationType.PAYMENT_FAILED,
        title: 'Payment unsuccessful',
        body: `Your payment for order ${orderRef(orderId)} didn't go through, so the order has been cancelled. You can place it again at any time.`,
        link: `/orders/${orderId}`,
        channels: CHANNELS,
      },
    ]);
  }

  /**
   * OrderCancellationService — `{ orderId, userId }`. It only cancels
   * unpaid orders, so no seller has been told about the order and none is
   * notified now.
   */
  private orderCancelled(event: OutboxEvent): Promise<Draft[]> {
    const orderId = readString(event.payload, 'orderId');
    const userId = readString(event.payload, 'userId');
    if (!orderId || !userId) return this.skip(event, 'orderId/userId');
    return Promise.resolve([
      {
        userId,
        type: NotificationType.ORDER_CANCELLED,
        title: 'Order cancelled',
        body: `Order ${orderRef(orderId)} has been cancelled. You haven't been charged for it.`,
        link: `/orders/${orderId}`,
        channels: CHANNELS,
      },
    ]);
  }

  /**
   * FulfillmentProvisioningService — `{ orderId, fulfillmentNumber,
   * warehouseId }` on the FulfillmentOrder aggregate. This, not
   * `order.paid`, is the seller's "new order" notice: it fires once per
   * fulfillment order and knows whether the seller ships it themselves
   * (warehouseId null, awaiting their acceptance). A first-party seller
   * order (no seller) notifies no one.
   */
  private async fulfillmentProvisioned(event: OutboxEvent): Promise<Draft[]> {
    const fulfillmentOrder = await this.prisma.fulfillmentOrder.findUnique({
      where: { id: event.aggregateId },
      select: {
        orderId: true,
        sellerOrderId: true,
        fulfillmentNumber: true,
        warehouseId: true,
        sellerOrder: { select: { seller: { select: { ownerUserId: true } } } },
      },
    });
    if (!fulfillmentOrder) return this.skip(event, 'fulfillment order');
    const sellerUserId = fulfillmentOrder.sellerOrder.seller?.ownerUserId;
    if (!sellerUserId) return [];
    const ref = orderRef(fulfillmentOrder.orderId);
    return [
      {
        userId: sellerUserId,
        type: NotificationType.SELLER_ORDER_RECEIVED,
        title: 'New order',
        body:
          fulfillmentOrder.warehouseId === null
            ? `Order ${ref} (${fulfillmentOrder.fulfillmentNumber}) is waiting for you to accept and ship it.`
            : `You have a new order ${ref} (${fulfillmentOrder.fulfillmentNumber}). It will be shipped from our warehouse.`,
        link: `/orders/${fulfillmentOrder.sellerOrderId}`,
        channels: CHANNELS,
      },
    ];
  }

  /**
   * FulfillmentsService's warehouse and seller dispatch paths — `{ fulfillmentOrderId,
   * orderId, dispatchNumber, shipmentId, lines }`. The tracking reference
   * is read from the shipment, since it isn't in the payload.
   */
  private async fulfillmentDispatched(event: OutboxEvent): Promise<Draft[]> {
    const order = await this.findOrder(
      event,
      readString(event.payload, 'orderId'),
    );
    if (!order) return [];
    const shipmentId = readString(event.payload, 'shipmentId');
    const shipment = shipmentId
      ? await this.prisma.shipment.findUnique({
          where: { id: shipmentId },
          select: { carrierCode: true, trackingReference: true },
        })
      : null;
    const tracking = shipment?.trackingReference
      ? ` Tracking: ${shipment.carrierCode} ${shipment.trackingReference}.`
      : '';
    return [
      {
        userId: order.userId,
        type: NotificationType.ORDER_DISPATCHED,
        title: 'Your order is on its way',
        body: `Items from order ${orderRef(order.id)} have been dispatched.${tracking}`,
        link: `/orders/${order.id}`,
        channels: CHANNELS,
      },
    ];
  }

  /**
   * FulfillmentsService's cancellation paths — `{ orderId, sellerOrderId,
   * lines, reason }`. The refund itself is raised by
   * FulfillmentCancellationRefundHandler; `reason` is staff/seller-facing.
   */
  private async refundRequired(event: OutboxEvent): Promise<Draft[]> {
    const order = await this.findOrder(
      event,
      readString(event.payload, 'orderId'),
    );
    if (!order) return [];
    return [
      {
        userId: order.userId,
        type: NotificationType.ORDER_ITEMS_CANCELLED,
        title: 'Items cancelled from your order',
        body: `Some items in order ${orderRef(order.id)} couldn't be fulfilled and have been cancelled. You'll be refunded for them.`,
        link: `/orders/${order.id}`,
        channels: CHANNELS,
      },
    ];
  }

  /**
   * ShipmentsService's tracking projection — `{ shipmentId, orderId,
   * deliveredAt }` on the Shipment aggregate, written when a shipment
   * first becomes DELIVERED. Read from the shipment row by id, so the only
   * contract an emitter must meet is `aggregateId` = the shipment's id.
   */
  private async shipmentDelivered(event: OutboxEvent): Promise<Draft[]> {
    const shipment = await this.prisma.shipment.findUnique({
      where: {
        id: readString(event.payload, 'shipmentId') ?? event.aggregateId,
      },
      select: { order: { select: { id: true, userId: true } } },
    });
    if (!shipment) return this.skip(event, 'shipment');
    return [
      {
        userId: shipment.order.userId,
        type: NotificationType.ORDER_DELIVERED,
        title: 'Delivered',
        body: `A delivery for order ${orderRef(shipment.order.id)} has arrived.`,
        link: `/orders/${shipment.order.id}`,
        channels: CHANNELS,
      },
    ];
  }

  private async findOrder(
    event: OutboxEvent,
    orderId: string | undefined,
  ): Promise<{ id: string; userId: string } | null> {
    const order = orderId
      ? await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { id: true, userId: true },
        })
      : null;
    if (!order) await this.skip(event, 'order');
    return order;
  }

  private skip(event: OutboxEvent, missing: string): Promise<Draft[]> {
    this.logger.warn(
      `Outbox event ${event.id} (${event.topic}): no ${missing} to notify about; skipped`,
    );
    return Promise.resolve([]);
  }
}
