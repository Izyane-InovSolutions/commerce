import { ConflictException } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../../infrastructure/jobs/outbox.service';
import { AuditService } from '../../audit/audit.service';
import type { PaymentProvider } from '../../payments/payment-provider';
import { PaymentsService } from '../../payments/payments.service';
import { OrdersService } from '../orders.service';
import { OrderCancellationService } from './order-cancellation.service';

const ACTOR = { userId: 'user-1', kind: 'customer' as const };

function payment(
  status: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'payment-1',
    orderId: 'order-1',
    provider: 'fake',
    providerReference: 'ref-1',
    status,
    ...overrides,
  };
}

describe('OrderCancellationService', () => {
  let tx: {
    order: { findUniqueOrThrow: jest.Mock };
    payment: { findUnique: jest.Mock };
  };
  let prisma: {
    order: { findUniqueOrThrow: jest.Mock };
    payment: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let ordersService: {
    findOwn: jest.Mock;
    lockForPayment: jest.Mock;
    cancel: jest.Mock;
  };
  let paymentsService: { reconcile: jest.Mock; applyProviderResult: jest.Mock };
  let provider: { name: string; cancelPayment: jest.Mock };
  let audit: { record: jest.Mock };
  let outbox: { record: jest.Mock };
  let service: OrderCancellationService;

  beforeEach(() => {
    tx = {
      order: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ status: 'PENDING_PAYMENT', userId: 'user-1' }),
      },
      payment: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    prisma = {
      order: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ status: 'PENDING_PAYMENT' }),
      },
      payment: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    };
    ordersService = {
      findOwn: jest.fn().mockResolvedValue({ id: 'order-1' }),
      lockForPayment: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue({ status: 'CANCELLED' }),
    };
    paymentsService = {
      reconcile: jest.fn(),
      applyProviderResult: jest.fn().mockResolvedValue(undefined),
    };
    provider = {
      name: 'fake',
      cancelPayment: jest.fn().mockResolvedValue({ status: 'CANCELLED' }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    outbox = { record: jest.fn().mockResolvedValue(undefined) };
    service = new OrderCancellationService(
      prisma as unknown as PrismaService,
      ordersService as unknown as OrdersService,
      paymentsService as unknown as PaymentsService,
      provider as unknown as PaymentProvider,
      audit as unknown as AuditService,
      outbox as unknown as OutboxService,
    );
  });

  it('cancels an order with no payment, re-reading the payment under the order lock', async () => {
    await service.cancelOwn(ACTOR, 'order-1');

    expect(ordersService.lockForPayment).toHaveBeenCalledWith('order-1', tx);
    expect(tx.payment.findUnique).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      select: { id: true, status: true },
    });
    expect(
      ordersService.lockForPayment.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.payment.findUnique.mock.invocationCallOrder[0]!);
    expect(ordersService.cancel).toHaveBeenCalledWith('order-1', tx);
    expect(outbox.record).toHaveBeenCalledTimes(1);
  });

  it('refuses with a retryable 409 when a checkout inserted a payment after the unlocked read', async () => {
    tx.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: 'PENDING',
    });

    const error = await service
      .cancelOwn(ACTOR, 'order-1')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(
      'Payment is starting; retry cancellation',
    );
    // Nothing was released or recorded: the order keeps its stock for the
    // payment that may now be at the gateway.
    expect(ordersService.cancel).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(outbox.record).not.toHaveBeenCalled();
    expect(paymentsService.applyProviderResult).not.toHaveBeenCalled();
  });

  it('on retry takes the payment-aware branch: stops the payment at the gateway, then cancels', async () => {
    prisma.payment.findUnique.mockResolvedValue(payment('PENDING'));
    tx.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: 'PENDING',
    });

    await service.cancelOwn(ACTOR, 'order-1');

    expect(provider.cancelPayment).toHaveBeenCalledWith(
      'ref-1',
      'Order cancelled by the customer',
    );
    expect(ordersService.cancel).toHaveBeenCalledWith('order-1', tx);
    expect(paymentsService.applyProviderResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'payment-1' }),
      expect.objectContaining({ status: 'CANCELLED' }),
    );
  });

  it('proceeds when the open payment only moved within the open states', async () => {
    prisma.payment.findUnique.mockResolvedValue(payment('PENDING'));
    tx.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: 'PROCESSING',
    });

    await service.cancelOwn(ACTOR, 'order-1');

    expect(ordersService.cancel).toHaveBeenCalledWith('order-1', tx);
  });

  it('refuses when an open payment settled between the gateway call and the lock', async () => {
    prisma.payment.findUnique.mockResolvedValue(payment('PENDING'));
    tx.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: 'SUCCEEDED',
    });

    await expect(service.cancelOwn(ACTOR, 'order-1')).rejects.toThrow(
      'Payment is starting; retry cancellation',
    );
    expect(ordersService.cancel).not.toHaveBeenCalled();
  });

  it('cancels over a payment that can no longer charge, seen the same both times', async () => {
    prisma.payment.findUnique.mockResolvedValue(payment('FAILED'));
    tx.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: 'FAILED',
    });

    await service.cancelOwn(ACTOR, 'order-1');

    expect(provider.cancelPayment).not.toHaveBeenCalled();
    expect(ordersService.cancel).toHaveBeenCalledWith('order-1', tx);
    expect(paymentsService.applyProviderResult).not.toHaveBeenCalled();
  });

  it('is a no-op for an order a concurrent path cancelled first', async () => {
    tx.order.findUniqueOrThrow.mockResolvedValue({
      status: 'CANCELLED',
      userId: 'user-1',
    });
    tx.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: 'FAILED',
    });

    await service.cancelOwn(ACTOR, 'order-1');

    expect(ordersService.cancel).not.toHaveBeenCalled();
    expect(outbox.record).not.toHaveBeenCalled();
  });
});
