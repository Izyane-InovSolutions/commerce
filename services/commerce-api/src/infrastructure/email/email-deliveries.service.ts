import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { EmailDeliveryStatus, type Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import {
  decryptField,
  encryptField,
  type FieldEncryptionKeyring,
} from '../../common/crypto/field-encryption.util';
import { PrismaService } from '../../database/prisma.service';
import { BackgroundJobsService } from '../jobs/background-jobs.service';
import { EMAIL_SENDER, type EmailSender } from './email-sender.interface';
import { renderEmail, type EmailTemplate } from './email-templates';

const DEFAULT_DELIVERY_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EmailDeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jobs: BackgroundJobsService,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
  ) {}

  async enqueue(
    tx: Prisma.TransactionClient,
    input: {
      template: EmailTemplate;
      recipient: string;
      variables?: Record<string, unknown>;
      expiresAt?: Date;
    },
  ): Promise<string> {
    const id = randomUUID();
    const keyring = this.encryptionKeyring();
    await tx.emailDelivery.create({
      data: {
        id,
        template: input.template,
        recipient: input.recipient,
        encryptedVars: encryptField(
          JSON.stringify(input.variables ?? {}),
          keyring,
          `email-delivery:${id}`,
        ),
        encryptionKeyId: keyring.activeKeyId,
        expiresAt:
          input.expiresAt ?? new Date(Date.now() + DEFAULT_DELIVERY_TTL_MS),
      },
    });
    await this.jobs.enqueue(
      { type: 'email.send', payload: { deliveryId: id } },
      tx,
    );
    return id;
  }

  async send(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.emailDelivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery || delivery.status !== EmailDeliveryStatus.PENDING) return;

    if (delivery.expiresAt <= new Date() || !delivery.encryptedVars) {
      await this.failPermanently(deliveryId, 'EXPIRED');
      return;
    }

    let variables: Record<string, unknown>;
    try {
      variables = JSON.parse(
        decryptField(
          delivery.encryptedVars,
          this.encryptionKeyring(),
          `email-delivery:${delivery.id}`,
        ),
      ) as Record<string, unknown>;
    } catch {
      await this.failPermanently(deliveryId, 'INVALID_ENCRYPTED_PAYLOAD');
      return;
    }

    if (delivery.template === 'password-reset') {
      const tokenId = variables.resetTokenId;
      if (typeof tokenId !== 'string') {
        await this.failPermanently(deliveryId, 'INVALID_EMAIL_TEMPLATE_DATA');
        return;
      }
      const token = await this.prisma.passwordResetToken.findUnique({
        where: { id: tokenId },
      });
      if (!token || token.usedAt || token.expiresAt <= new Date()) {
        await this.failPermanently(deliveryId, 'RESET_TOKEN_INACTIVE');
        return;
      }
    }

    let rendered;
    try {
      rendered = renderEmail(delivery.template, variables);
      await this.sender.send({
        ...rendered,
        to: delivery.recipient,
        messageId: `<${delivery.id}@commerce.email>`,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        ['UNKNOWN_EMAIL_TEMPLATE', 'INVALID_EMAIL_TEMPLATE_DATA'].includes(
          error.message,
        )
      ) {
        await this.failPermanently(deliveryId, error.message);
        return;
      }
      throw new Error('SMTP_DELIVERY_FAILED');
    }

    await this.prisma.emailDelivery.updateMany({
      where: { id: deliveryId, status: EmailDeliveryStatus.PENDING },
      data: {
        status: EmailDeliveryStatus.SENT,
        sentAt: new Date(),
        encryptedVars: null,
        lastErrorCode: null,
      },
    });
  }

  async failPermanently(deliveryId: string, code: string): Promise<void> {
    await this.prisma.emailDelivery.updateMany({
      where: { id: deliveryId, status: EmailDeliveryStatus.PENDING },
      data: {
        status: EmailDeliveryStatus.FAILED,
        failedAt: new Date(),
        encryptedVars: null,
        lastErrorCode: code,
      },
    });
  }

  @Interval(60_000)
  async clearExpired(): Promise<void> {
    await this.prisma.emailDelivery.updateMany({
      where: {
        status: EmailDeliveryStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      data: {
        status: EmailDeliveryStatus.FAILED,
        failedAt: new Date(),
        encryptedVars: null,
        lastErrorCode: 'EXPIRED',
      },
    });
  }

  private encryptionKeyring(): FieldEncryptionKeyring {
    return {
      activeKeyId: this.config.getOrThrow<string>(
        'EMAIL_DELIVERY_ENCRYPTION_ACTIVE_KEY_ID',
      ),
      keys: JSON.parse(
        this.config.getOrThrow<string>('EMAIL_DELIVERY_ENCRYPTION_KEYS'),
      ) as Record<string, string>,
    };
  }
}
