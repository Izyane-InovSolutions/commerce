import { Module } from '@nestjs/common';

import { EmailChannelSender } from './delivery/email-channel.sender';
import { MailerService } from './delivery/mailer.service';
import {
  NOTIFICATION_CHANNEL_SENDERS,
  type NotificationChannelSender,
} from './delivery/notification-channel';
import { NotificationDeliveryService } from './delivery/notification-delivery.service';
import { NotificationsOutboxSubscriber } from './notifications-outbox.subscriber';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// NotificationsOutboxSubscriber is exported for WorkersModule to register
// with the outbox dispatcher; MailerService for mail that must not become an
// in-app notification (AuthService's password reset — see there).
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    MailerService,
    EmailChannelSender,
    {
      provide: NOTIFICATION_CHANNEL_SENDERS,
      inject: [EmailChannelSender],
      useFactory: (email: EmailChannelSender): NotificationChannelSender[] => [
        email,
      ],
    },
    NotificationDeliveryService,
    NotificationsOutboxSubscriber,
  ],
  exports: [NotificationsService, MailerService, NotificationsOutboxSubscriber],
})
export class NotificationsModule {}
