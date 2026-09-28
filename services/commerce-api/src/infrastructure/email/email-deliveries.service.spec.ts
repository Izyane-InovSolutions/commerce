import { ConfigService } from '@nestjs/config';
import { EmailDeliveryStatus } from '@prisma/client';

import { encryptField } from '../../common/crypto/field-encryption.util';
import { PrismaService } from '../../database/prisma.service';
import { BackgroundJobsService } from '../jobs/background-jobs.service';
import { EmailDeliveriesService } from './email-deliveries.service';
import type { EmailSender } from './email-sender.interface';

const KEY = 'dGVzdC1vbmx5LWVtYWlsLWRlbGl2ZXJ5LWtleSEhISE=';
const keyring = { activeKeyId: 'v1', keys: { v1: KEY } };

describe('EmailDeliveriesService', () => {
  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (key.endsWith('ACTIVE_KEY_ID')) return 'v1';
      if (key.endsWith('ENCRYPTION_KEYS')) return JSON.stringify(keyring.keys);
      throw new Error(`Unexpected key ${key}`);
    }),
  };

  it('stores encrypted variables and queues only the delivery id', async () => {
    let createdData: { id: string; encryptedVars: string } | undefined;
    const tx = {
      emailDelivery: {
        create: jest.fn(
          (input: { data: { id: string; encryptedVars: string } }) => {
            createdData = input.data;
            return Promise.resolve({ id: input.data.id });
          },
        ),
      },
    };
    const jobs = { enqueue: jest.fn() };
    const service = new EmailDeliveriesService(
      {} as PrismaService,
      config as unknown as ConfigService,
      jobs as unknown as BackgroundJobsService,
      { send: jest.fn() } as EmailSender,
    );

    await service.enqueue(tx as never, {
      template: 'password-reset',
      recipient: 'user@example.com',
      variables: { resetUrl: 'https://store.test/reset-password?token=secret' },
    });

    expect(createdData).toBeDefined();
    expect(createdData!.encryptedVars).not.toContain('secret');
    expect(jobs.enqueue).toHaveBeenCalledWith(
      {
        type: 'email.send',
        payload: { deliveryId: createdData!.id },
      },
      tx,
    );
  });

  it('sends an active reset email and clears its encrypted payload', async () => {
    const id = 'ce838c8d-41cf-4678-bf67-70faef91b370';
    const encryptedVars = encryptField(
      JSON.stringify({
        resetUrl: 'https://store.test/reset-password?token=secret',
        resetTokenId: 'reset-1',
      }),
      keyring,
      `email-delivery:${id}`,
    );
    const prisma = {
      emailDelivery: {
        findUnique: jest.fn().mockResolvedValue({
          id,
          template: 'password-reset',
          recipient: 'user@example.com',
          encryptedVars,
          status: EmailDeliveryStatus.PENDING,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'reset-1',
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };
    const sender = { send: jest.fn().mockResolvedValue(undefined) };
    const service = new EmailDeliveriesService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      {} as BackgroundJobsService,
      sender,
    );

    await service.send(id);

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        messageId: `<${id}@commerce.email>`,
      }),
    );
    expect(prisma.emailDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EmailDeliveryStatus.SENT,
          encryptedVars: null,
        }) as object,
      }),
    );
  });

  it('exposes only a generic error when SMTP fails', async () => {
    const id = 'ce838c8d-41cf-4678-bf67-70faef91b370';
    const prisma = {
      emailDelivery: {
        findUnique: jest.fn().mockResolvedValue({
          id,
          template: 'password-changed',
          recipient: 'user@example.com',
          encryptedVars: encryptField('{}', keyring, `email-delivery:${id}`),
          status: EmailDeliveryStatus.PENDING,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: jest.fn(),
      },
    };
    const sender = {
      send: jest.fn().mockRejectedValue(new Error('secret provider response')),
    };
    const service = new EmailDeliveriesService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      {} as BackgroundJobsService,
      sender,
    );

    await expect(service.send(id)).rejects.toThrow('SMTP_DELIVERY_FAILED');
  });

  it('does not send verification mail after the account email changes', async () => {
    const id = 'ce838c8d-41cf-4678-bf67-70faef91b370';
    const prisma = {
      emailDelivery: {
        findUnique: jest.fn().mockResolvedValue({
          id,
          template: 'email-verification',
          recipient: 'old@example.com',
          encryptedVars: encryptField(
            JSON.stringify({
              verificationUrl: 'https://store.test/verify-email?token=secret',
              verificationTokenId: 'verification-1',
            }),
            keyring,
            `email-delivery:${id}`,
          ),
          status: EmailDeliveryStatus.PENDING,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      emailVerificationToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'verification-1',
          targetEmail: 'old@example.com',
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          user: { email: 'new@example.com' },
        }),
      },
    };
    const sender = { send: jest.fn() };
    const service = new EmailDeliveriesService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      {} as BackgroundJobsService,
      sender,
    );

    await service.send(id);

    expect(sender.send).not.toHaveBeenCalled();
    expect(prisma.emailDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EmailDeliveryStatus.FAILED,
          encryptedVars: null,
          lastErrorCode: 'VERIFICATION_TOKEN_INACTIVE',
        }) as object,
      }),
    );
  });
});
