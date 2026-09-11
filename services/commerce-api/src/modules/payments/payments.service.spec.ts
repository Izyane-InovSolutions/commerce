import { PaymentStatus } from '@prisma/client';

import { LedgerService } from '../financials/ledger.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../../database/prisma.service';
import type { PaymentProvider } from './payment-provider';
import { PaymentsService } from './payments.service';
import { PaymentOutcomeUnknownException } from './gateway-errors';

function buildPrisma(): {
  payment: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
  paymentEvent: { create: jest.Mock; findUnique: jest.Mock };
  refund: { create: jest.Mock; update: jest.Mock };
} {
  return {
    payment: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    paymentEvent: { create: jest.fn(), findUnique: jest.fn() },
    refund: { create: jest.fn(), update: jest.fn() },
  };
}

describe('PaymentsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let provider: jest.Mocked<PaymentProvider>;
  let ordersService: {
    confirmPayment: jest.Mock;
    cancel: jest.Mock;
    getSellerOrderForPayment: jest.Mock;
    applyRefund: jest.Mock;
  };
  let ledgerService: { recordRefundReversal: jest.Mock };
  let service: PaymentsService;
  // Accessing provider.refund directly (an interface method) trips
  // @typescript-eslint/unbound-method; a local reference avoids it.
  let refund: jest.Mock;

  beforeEach(() => {
    prisma = buildPrisma();
    // Built from a standalone const, not read back off `provider`, so
    // asserting on it never triggers @typescript-eslint/unbound-method.
    refund = jest.fn();
    provider = {
      name: 'fake-provider',
      initialize: jest.fn(),
      getPayment: jest.fn(),
      verifyWebhook: jest.fn(),
      refund,
      getRefund: jest.fn(),
    };
    ordersService = {
      confirmPayment: jest.fn(),
      cancel: jest.fn(),
      getSellerOrderForPayment: jest.fn(),
      applyRefund: jest.fn(),
    };
    ledgerService = {
      recordRefundReversal: jest.fn().mockResolvedValue(undefined),
    };
    service = new PaymentsService(
      prisma as unknown as PrismaService,
      provider,
      ordersService as unknown as OrdersService,
      ledgerService as unknown as LedgerService,
    );
  });

  describe('initializeForOrder', () => {
    const order = { id: 'order-1', total: 2000, currency: 'USD' } as never;

    it('preserves the pending payment after an ambiguous gateway outcome', async () => {
      const pending = { id: 'payment-1', status: PaymentStatus.PENDING };
      prisma.payment.create.mockResolvedValue(pending);
      prisma.payment.update.mockResolvedValue(pending);
      provider.initialize.mockRejectedValue(
        new PaymentOutcomeUnknownException(),
      );
      await expect(service.initializeForOrder(order)).resolves.toMatchObject({
        ...pending,
        requiresReconciliation: true,
      });
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: { failureReason: 'Gateway outcome requires reconciliation' },
      });
      expect(ordersService.cancel).not.toHaveBeenCalled();
    });

    it('does not report a declined charge when saving an accepted payment fails', async () => {
      const pending = { id: 'payment-1', status: PaymentStatus.PENDING };
      prisma.payment.create.mockResolvedValue(pending);
      prisma.payment.update.mockRejectedValue(
        new Error('Database unavailable'),
      );
      provider.initialize.mockResolvedValue({
        providerReference: 'pay_123',
        status: 'PENDING',
      });
      await expect(service.initializeForOrder(order)).resolves.toMatchObject({
        ...pending,
        requiresReconciliation: true,
      });
      expect(ordersService.cancel).not.toHaveBeenCalled();
    });

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

  describe('refundSellerOrder', () => {
    const sellerOrder = {
      id: 'so-1',
      orderId: 'order-1',
      sellerId: 'seller-1',
      total: 1000,
      refundedAmount: 0,
      currency: 'USD',
    };
    const payment = {
      id: 'payment-1',
      orderId: 'order-1',
      providerReference: 'pay_123',
      amount: 1000,
      refundedAmount: 0,
    };

    it('records SUCCEEDED, updates Payment, and applies the refund + ledger reversal on success', async () => {
      ordersService.getSellerOrderForPayment.mockResolvedValue(sellerOrder);
      prisma.payment.findUnique.mockResolvedValue(payment);
      prisma.refund.create.mockResolvedValue({
        id: 'refund-1',
        status: 'PENDING',
      });
      refund.mockResolvedValue({
        providerReference: 'refund_ref_1',
        status: 'SUCCEEDED',
      });
      prisma.refund.update.mockResolvedValue({
        id: 'refund-1',
        status: 'SUCCEEDED',
      });

      const result = await service.refundSellerOrder(
        'so-1',
        400,
        'Customer request',
        'idem-1',
      );

      expect(refund).toHaveBeenCalledWith(
        'pay_123',
        400,
        'Customer request',
        'idem-1',
      );
      expect(prisma.refund.update).toHaveBeenCalledWith({
        where: { id: 'refund-1' },
        data: { status: 'SUCCEEDED', providerReference: 'refund_ref_1' },
      });
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: { refundedAmount: 400, status: 'PARTIALLY_REFUNDED' },
      });
      expect(ordersService.applyRefund).toHaveBeenCalledWith('so-1', 400);
      expect(ledgerService.recordRefundReversal).toHaveBeenCalledWith(
        sellerOrder,
        400,
      );
      expect(result.status).toBe('SUCCEEDED');
    });

    it('marks the Payment REFUNDED once the cumulative refund covers the full amount', async () => {
      ordersService.getSellerOrderForPayment.mockResolvedValue(sellerOrder);
      prisma.payment.findUnique.mockResolvedValue(payment);
      prisma.refund.create.mockResolvedValue({ id: 'refund-1' });
      refund.mockResolvedValue({
        providerReference: 'refund_ref_1',
        status: 'SUCCEEDED',
      });
      prisma.refund.update.mockResolvedValue({
        id: 'refund-1',
        status: 'SUCCEEDED',
      });

      await service.refundSellerOrder(
        'so-1',
        1000,
        'Customer request',
        'idem-1',
      );

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: { refundedAmount: 1000, status: 'REFUNDED' },
      });
    });

    it('rejects a refund amount exceeding the remaining refundable balance', async () => {
      ordersService.getSellerOrderForPayment.mockResolvedValue({
        ...sellerOrder,
        refundedAmount: 900,
      });
      prisma.payment.findUnique.mockResolvedValue(payment);

      await expect(
        service.refundSellerOrder('so-1', 200, 'reason', 'idem-1'),
      ).rejects.toThrow();
      expect(refund).not.toHaveBeenCalled();
    });

    it('marks the Refund FAILED and rethrows without touching Payment/Orders/Ledger on provider failure', async () => {
      ordersService.getSellerOrderForPayment.mockResolvedValue(sellerOrder);
      prisma.payment.findUnique.mockResolvedValue(payment);
      prisma.refund.create.mockResolvedValue({ id: 'refund-1' });
      const error = new Error('Gateway unavailable');
      refund.mockRejectedValue(error);

      await expect(
        service.refundSellerOrder('so-1', 400, 'reason', 'idem-1'),
      ).rejects.toThrow(error);

      expect(prisma.refund.update).toHaveBeenCalledWith({
        where: { id: 'refund-1' },
        data: { status: 'FAILED', failureReason: 'Gateway unavailable' },
      });
      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(ordersService.applyRefund).not.toHaveBeenCalled();
      expect(ledgerService.recordRefundReversal).not.toHaveBeenCalled();
    });
  });
});
