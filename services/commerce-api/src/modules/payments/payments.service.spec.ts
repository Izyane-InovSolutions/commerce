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

      const result = await service.initializeForOrder(order);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: { providerReference: 'ref-1', status: PaymentStatus.PENDING },
      });
      expect(result.redirectUrl).toBe('https://gateway.example/pay');
    });

    it('marks the payment FAILED and rethrows on provider failure', async () => {
      prisma.payment.create.mockResolvedValue({ id: 'payment-1' });
      provider.initialize.mockRejectedValue(
        new Error('Payment integration is awaiting the external provider API'),
      );

      await expect(service.initializeForOrder(order)).rejects.toThrow(
        'awaiting the external provider API',
      );

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: {
          status: PaymentStatus.FAILED,
          failureReason:
            'Payment integration is awaiting the external provider API',
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

    it('confirms the order when the event is SUCCEEDED', async () => {
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

    it('cancels the order when the event is FAILED', async () => {
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
