import { PaymentStatus } from '@prisma/client';

import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../../database/prisma.service';
import type { PaymentProvider } from './payment-provider';
import { PaymentsService } from './payments.service';

function buildPrisma(): {
  payment: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
  paymentEvent: { create: jest.Mock; findUnique: jest.Mock };
} {
  return {
    payment: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    paymentEvent: { create: jest.fn(), findUnique: jest.fn() },
  };
}

describe('PaymentsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let provider: jest.Mocked<PaymentProvider>;
  let ordersService: { confirmPayment: jest.Mock; cancel: jest.Mock };
  let service: PaymentsService;

  const paymentInput = {
    paymentMethod: 'MOBILE_MONEY' as const,
    phoneNumber: '0977123456',
    provider: 'AIRTEL' as const,
    description: 'Payment for order-1',
    metadata: { orderId: 'order-1', channel: 'web' },
  };

  beforeEach(() => {
    prisma = buildPrisma();
    provider = {
      name: 'fake-provider',
      initialize: jest.fn(),
      getPayment: jest.fn(),
      verifyWebhook: jest.fn(),
      refund: jest.fn(),
      getRefund: jest.fn(),
    };
    ordersService = { confirmPayment: jest.fn(), cancel: jest.fn() };
    service = new PaymentsService(
      prisma as unknown as PrismaService,
      provider,
      ordersService as unknown as OrdersService,
    );
  });

  describe('initializeForOrder', () => {
    const order = { id: 'order-1', total: 2000, currency: 'USD' } as never;

    it('records the provider result on success', async () => {
      prisma.payment.create.mockResolvedValue({ id: 'payment-1' });
      provider.initialize.mockResolvedValue({
        providerReference: 'ref-1',
        status: 'PENDING',
        redirectUrl: 'https://gateway.example/pay',
      });
      prisma.payment.update.mockResolvedValue({
        id: 'payment-1',
        status: PaymentStatus.PENDING,
      });

      const result = await service.initializeForOrder(order, paymentInput);

      expect(provider.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'payment-1',
          amount: 2000,
          currency: 'USD',
          idempotencyKey: 'order-1',
          reference: 'order-1',
          paymentMethod: 'MOBILE_MONEY',
          phoneNumber: '0977123456',
        }),
      );
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: { providerReference: 'ref-1', status: PaymentStatus.PENDING },
      });
      expect(result.redirectUrl).toBe('https://gateway.example/pay');
    });

    it('marks the payment FAILED and rethrows on provider failure', async () => {
      prisma.payment.create.mockResolvedValue({ id: 'payment-1' });
      provider.initialize.mockRejectedValue(
        new Error('Unified Payments rejected the payment request'),
      );

      await expect(
        service.initializeForOrder(order, paymentInput),
      ).rejects.toThrow('Unified Payments rejected the payment request');

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: 'Unified Payments rejected the payment request',
        },
      });
    });
  });

  describe('handleWebhook', () => {
    it('is a no-op when the event was already recorded', async () => {
      provider.verifyWebhook.mockReturnValue({
        id: 'evt-1',
        providerReference: 'ref-1',
        type: 'payment.succeeded',
        status: 'SUCCEEDED',
        payload: {},
      });
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-1',
        orderId: 'order-1',
      });
      prisma.paymentEvent.findUnique.mockResolvedValue({
        id: 'existing-event',
      });

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
      expect(ordersService.confirmPayment).not.toHaveBeenCalled();
    });

    it('confirms the order when an event is SUCCEEDED', async () => {
      provider.verifyWebhook.mockReturnValue({
        id: 'evt-1',
        providerReference: 'ref-1',
        type: 'payment.succeeded',
        status: 'SUCCEEDED',
        payload: {},
      });
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-1',
        orderId: 'order-1',
      });
      prisma.paymentEvent.findUnique.mockResolvedValue(null);

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(prisma.paymentEvent.create).toHaveBeenCalled();
      expect(ordersService.confirmPayment).toHaveBeenCalledWith('order-1');
    });

    it('cancels the order when an event is FAILED', async () => {
      provider.verifyWebhook.mockReturnValue({
        id: 'evt-1',
        providerReference: 'ref-1',
        type: 'payment.failed',
        status: 'FAILED',
        payload: {},
      });
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-1',
        orderId: 'order-1',
      });
      prisma.paymentEvent.findUnique.mockResolvedValue(null);

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
    });
  });
});
