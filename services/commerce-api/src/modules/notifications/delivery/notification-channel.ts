import type { Notification, NotificationChannel, User } from '@prisma/client';

export const NOTIFICATION_CHANNEL_SENDERS = Symbol(
  'NOTIFICATION_CHANNEL_SENDERS',
);

export type ChannelSendResult = { providerMessageId: string | null };

/**
 * Sends a notification's out-of-app copy on one channel. Senders are
 * registered under NOTIFICATION_CHANNEL_SENDERS (see NotificationsModule),
 * one per channel.
 *
 * Only EMAIL has a sender today (EmailChannelSender). SMS is in the schema's
 * NotificationChannel enum, and push would be another member, but neither
 * has a provider yet: a delivery row for a channel with no registered sender
 * is marked SKIPPED rather than left PENDING forever. Adding one means
 * implementing this interface (an SMS gateway would read `user.phone`) and
 * adding it to that provider list — nothing else changes.
 */
export interface NotificationChannelSender {
  readonly channel: NotificationChannel;
  /** Recorded on the delivery row, e.g. "smtp" or "log". */
  readonly provider: string;
  /** Where this channel would send for the user; null when there's nowhere. */
  recipientFor(user: Pick<User, 'email' | 'phone'>): string | null;
  send(
    recipient: string,
    notification: Pick<Notification, 'type' | 'title' | 'body' | 'link'>,
  ): Promise<ChannelSendResult>;
}
