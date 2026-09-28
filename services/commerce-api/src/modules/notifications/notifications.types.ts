import type { NotificationChannel } from '@prisma/client';

/**
 * The notification types the outbox subscriber creates. A `seller.` prefix
 * marks one addressed to a seller about their own sales — its `link` is a
 * path in the seller app, not the storefront (see audienceOf).
 */
export const NotificationType = {
  ORDER_CONFIRMED: 'order.confirmed',
  PAYMENT_FAILED: 'payment.failed',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_DISPATCHED: 'order.dispatched',
  ORDER_DELIVERED: 'order.delivered',
  ORDER_ITEMS_CANCELLED: 'order.items_cancelled',
  SELLER_ORDER_RECEIVED: 'seller.order.received',
} as const;

export type NotificationAudience = 'customer' | 'seller';

/** Which app a notification's `link` is a path in, for absolute email links. */
export function audienceOf(type: string): NotificationAudience {
  return type.startsWith('seller.') ? 'seller' : 'customer';
}

/** The inbox shape the web app reads (apps/web/src/lib/notifications.ts). */
export type NotificationView = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export type NotificationPage = {
  items: NotificationView[];
  total: number;
  page: number;
  limit: number;
};

export type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  /**
   * Makes a replayed create a no-op — outbox subscribers run at least once
   * per event, so they derive this from the event id.
   */
  dedupeKey: string;
  /** Out-of-app copies to send; the in-app record is always created. */
  channels?: NotificationChannel[];
};
