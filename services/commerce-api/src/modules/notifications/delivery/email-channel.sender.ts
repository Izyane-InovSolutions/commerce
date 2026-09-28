import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationChannel,
  type Notification,
  type User,
} from '@prisma/client';

import { absoluteAppUrl } from '../app-links';
import { audienceOf } from '../notifications.types';
import { MailerService } from './mailer.service';
import type {
  ChannelSendResult,
  NotificationChannelSender,
} from './notification-channel';

/** Plain-text email copy of an in-app notification, linking back into the
 * app it belongs to (storefront or seller app). */
@Injectable()
export class EmailChannelSender implements NotificationChannelSender {
  readonly channel = NotificationChannel.EMAIL;

  constructor(
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  get provider(): string {
    return this.mailer.kind;
  }

  recipientFor(user: Pick<User, 'email' | 'phone'>): string | null {
    return user.email || null;
  }

  async send(
    recipient: string,
    notification: Pick<Notification, 'type' | 'title' | 'body' | 'link'>,
  ): Promise<ChannelSendResult> {
    const lines = [notification.body];
    if (notification.link)
      lines.push(
        '',
        absoluteAppUrl(
          this.config,
          audienceOf(notification.type),
          notification.link,
        ),
      );
    const { messageId } = await this.mailer.send({
      to: recipient,
      subject: notification.title,
      text: lines.join('\n'),
    });
    return { providerMessageId: messageId };
  }
}
