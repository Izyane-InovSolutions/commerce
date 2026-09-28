import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  NotificationDeliveryStatus,
  type NotificationChannel,
  type NotificationDelivery,
} from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { registerRecurringTask } from '../../../infrastructure/jobs/recurring-task';
import {
  NOTIFICATION_CHANNEL_SENDERS,
  type NotificationChannelSender,
} from './notification-channel';

/** Attempts per delivery before it is left FAILED for good. */
export const MAX_DELIVERY_ATTEMPTS = 5;
/** First retry delay, doubling per attempt up to MAX_RETRY_DELAY_MS. */
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1_000;
/**
 * A claimed delivery still PENDING this long after its claim belonged to a
 * process that died mid-send; it is claimed again. Comfortably above the
 * SMTP timeouts in MailerService.
 */
const IN_FLIGHT_LEASE_MS = 5 * 60 * 1_000;
const BATCH_SIZE = 25;

export type DeliverySweepSummary = {
  sent: number;
  failed: number;
  skipped: number;
};

type Candidate = Pick<
  NotificationDelivery,
  'id' | 'status' | 'attempts' | 'updatedAt'
>;

export function retryDelayMs(attempts: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** (attempts - 1));
}

/**
 * Sends the email (and, once a provider exists, SMS/push) copies of
 * notifications, recording each attempt on its NotificationDelivery row.
 *
 * Everything goes through one recurring sweep rather than being sent inline
 * by whoever created the notification: a slow or failing mail server then
 * never holds up an outbox dispatch or a request, and first sends, retries
 * and recovery of a crashed send are all the same code path.
 *
 * A row is claimed before it is sent — status forced to PENDING and
 * attempts incremented, conditional on the values just read — so it is only
 * ever sent by the claimer, and a fresh `updatedAt` marks it in flight
 * (see IN_FLIGHT_LEASE_MS). Selection and claiming happen under a
 * transaction-scoped advisory lock, the PaymentReconciliationScheduler
 * pattern, so replicas don't contend over the same batch; the sends
 * themselves happen after that transaction commits, so no transaction is
 * held open across network calls.
 */
@Injectable()
export class NotificationDeliveryService implements OnModuleInit {
  private readonly logger = new Logger(NotificationDeliveryService.name);
  private readonly senders: Map<NotificationChannel, NotificationChannelSender>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(NOTIFICATION_CHANNEL_SENDERS)
    senders: NotificationChannelSender[],
  ) {
    this.senders = new Map(senders.map((sender) => [sender.channel, sender]));
  }

  onModuleInit(): void {
    registerRecurringTask(this.schedulerRegistry, this.config, {
      name: 'notifications.delivery',
      intervalMs: Number(
        this.config.get('NOTIFICATION_DELIVERY_INTERVAL_MS', 10_000),
      ),
      run: () => this.sweep(),
      logger: this.logger,
    });
  }

  async sweep(now = new Date()): Promise<DeliverySweepSummary> {
    const claimed = await this.claimDue(now);
    const summary: DeliverySweepSummary = { sent: 0, failed: 0, skipped: 0 };
    for (const id of claimed) {
      const status = await this.send(id);
      if (status === NotificationDeliveryStatus.SENT) summary.sent += 1;
      else if (status === NotificationDeliveryStatus.SKIPPED)
        summary.skipped += 1;
      else summary.failed += 1;
    }
    return summary;
  }

  /** Claims up to BATCH_SIZE deliveries that are due, returning their ids. */
  private claimDue(now: Date): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      // The key is arbitrary but must differ from every other advisory lock
      // in the app (PaymentReconciliationScheduler holds 730021).
      const [lock] = await tx.$queryRaw<
        { acquired: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(730022) AS acquired`;
      if (!lock?.acquired) return [];

      const candidates: Candidate[] = await tx.notificationDelivery.findMany({
        where: {
          OR: [
            // Never attempted.
            { status: NotificationDeliveryStatus.PENDING, attempts: 0 },
            // Claimed by a process that never recorded an outcome.
            {
              status: NotificationDeliveryStatus.PENDING,
              attempts: { gt: 0, lt: MAX_DELIVERY_ATTEMPTS },
              updatedAt: { lt: new Date(now.getTime() - IN_FLIGHT_LEASE_MS) },
            },
            // Failed, with attempts left; backoff is checked below.
            {
              status: NotificationDeliveryStatus.FAILED,
              attempts: { lt: MAX_DELIVERY_ATTEMPTS },
            },
          ],
        },
        orderBy: { updatedAt: 'asc' },
        take: BATCH_SIZE * 4,
        select: { id: true, status: true, attempts: true, updatedAt: true },
      });

      const due = candidates
        .filter(
          (row) =>
            row.status !== NotificationDeliveryStatus.FAILED ||
            row.updatedAt.getTime() + retryDelayMs(row.attempts) <=
              now.getTime(),
        )
        .slice(0, BATCH_SIZE);

      const ids: string[] = [];
      for (const row of due) {
        const { count } = await tx.notificationDelivery.updateMany({
          where: { id: row.id, status: row.status, attempts: row.attempts },
          data: {
            status: NotificationDeliveryStatus.PENDING,
            attempts: { increment: 1 },
            updatedAt: now,
          },
        });
        if (count === 1) ids.push(row.id);
      }
      return ids;
    });
  }

  /** Makes one attempt at an already-claimed delivery and records it. */
  private async send(id: string): Promise<NotificationDeliveryStatus> {
    const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({
      where: { id },
      include: {
        notification: {
          include: { user: { select: { email: true, phone: true } } },
        },
      },
    });
    const sender = this.senders.get(delivery.channel);
    if (!sender)
      return this.record(id, NotificationDeliveryStatus.SKIPPED, {
        lastError: `No ${delivery.channel} provider is configured`,
      });

    const recipient = sender.recipientFor(delivery.notification.user);
    if (!recipient)
      return this.record(id, NotificationDeliveryStatus.SKIPPED, {
        provider: sender.provider,
        lastError: `User has no ${delivery.channel} recipient`,
      });

    try {
      const result = await sender.send(recipient, delivery.notification);
      return this.record(id, NotificationDeliveryStatus.SENT, {
        provider: sender.provider,
        recipient,
        providerMessageId: result.providerMessageId,
        sentAt: new Date(),
        lastError: null,
      });
    } catch (error) {
      this.logger.warn(
        `Notification delivery ${id} (${delivery.channel}) failed on attempt ${delivery.attempts}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.record(id, NotificationDeliveryStatus.FAILED, {
        provider: sender.provider,
        recipient,
        lastError: (error instanceof Error
          ? error.message
          : String(error)
        ).slice(0, 4_000),
      });
    }
  }

  private async record(
    id: string,
    status: NotificationDeliveryStatus,
    data: Partial<
      Pick<
        NotificationDelivery,
        'provider' | 'recipient' | 'providerMessageId' | 'sentAt' | 'lastError'
      >
    >,
  ): Promise<NotificationDeliveryStatus> {
    await this.prisma.notificationDelivery.update({
      where: { id },
      data: { status, ...data },
    });
    return status;
  }
}
