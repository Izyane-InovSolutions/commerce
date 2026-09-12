import { PaymentStatus } from '@prisma/client';
import { ConflictException, NotImplementedException } from '@nestjs/common';
import { LedgerService } from '../financials/ledger.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../../database/prisma.service';
import type { PaymentProvider } from './payment-provider';
import { PaymentsService } from './payments.service';
import { PaymentOutcomeUnknownException } from './gateway-errors';

function buildPrisma(): {
  payment: Record<
    'create' | 'update' | 'findUnique' | 'findUniqueOrThrow',
    jest.Mock
  >;
  paymentEvent: Record<'create' | 'findUnique', jest.Mock>;
  refund: Record<
    'create' | 'update' | 'findUnique' | 'findUniqueOrThrow' | 'findMany',
    jest.Mock
  >;
  $transaction: jest.Mock;
} {
  const p = {
    payment: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    paymentEvent: { create: jest.fn(), findUnique: jest.fn() },
    refund: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  };
  p.$transaction.mockImplementation((fn: (tx: typeof p) => unknown) => fn(p));
  return p;
}

describe('PaymentsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let provider: jest.Mocked<PaymentProvider>;
  let refundCall: jest.Mock;
  let getPaymentCall: jest.Mock;
  let ordersService: {
    confirmPayment: jest.Mock;
    cancel: jest.Mock;
    lockForPayment: jest.Mock;
    getSellerOrderForPayment: jest.Mock;
    applyRefund: jest.Mock;
  };
  let ledgerService: { recordRefundReversal: jest.Mock };
  let service: PaymentsService;
  const payment = {
    id: 'payment-1',
    orderId: 'order-1',
    provider: 'fake-provider',
    providerReference: 'pay_123',
    amount: 1000,
    refundedAmount: 0,
    currency: 'USD',
    status: PaymentStatus.SUCCEEDED,
  };
  const sellerOrder = {
    id: 'so-1',
    orderId: 'order-1',
    total: 1000,
    refundedAmount: 0,
    status: 'PAID',
    currency: 'USD',
  };
  const pending = {
    id: 'refund-1',
    paymentId: 'payment-1',
    sellerOrderId: 'so-1',
    amount: 400,
    reason: 'Customer request',
    currency: 'USD',
    status: 'PENDING',
    idempotencyKey: 'key',
    providerReference: null,
  };
  beforeEach(() => {
    prisma = buildPrisma();
    refundCall = jest.fn();
    getPaymentCall = jest.fn();
    provider = {
      name: 'fake-provider',
      initialize: jest.fn(),
      getPayment: getPaymentCall,
      verifyWebhook: jest.fn(),
      refund: refundCall,
      getRefund: jest.fn(),
    };
    ordersService = {
      confirmPayment: jest.fn(),
      cancel: jest.fn(),
      lockForPayment: jest.fn(),
      getSellerOrderForPayment: jest.fn().mockResolvedValue(sellerOrder),
      applyRefund: jest.fn(),
    };
    ledgerService = { recordRefundReversal: jest.fn() };
    service = new PaymentsService(
      prisma as unknown as PrismaService,
      provider,
      ordersService as unknown as OrdersService,
      ledgerService as unknown as LedgerService,
    );
    prisma.payment.findUnique.mockResolvedValue(payment);
    prisma.payment.findUniqueOrThrow.mockResolvedValue(payment);
    prisma.refund.create.mockResolvedValue(pending);
    prisma.refund.findUniqueOrThrow.mockResolvedValue({ ...pending, payment });
    prisma.refund.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...pending, ...data }),
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

    // A card charge settles inline, so the order has to advance at checkout;
    // nothing reconciles it later, because the payment already looks settled.
    it('settles the order when the gateway approves the charge inline', async () => {
      const created = {
        id: 'payment-1',
        orderId: 'order-1',
        provider: 'fake-provider',
        status: PaymentStatus.PENDING,
        providerReference: null,
      };
      const referenced = { ...created, providerReference: 'pay_123' };
      prisma.payment.create.mockResolvedValue(created);
      prisma.payment.update.mockResolvedValue(referenced);
      prisma.payment.findUnique.mockResolvedValue(referenced);
      prisma.payment.findUniqueOrThrow
        .mockResolvedValueOnce(referenced)
        .mockResolvedValue({ ...referenced, status: PaymentStatus.SUCCEEDED });
      prisma.paymentEvent.findUnique.mockResolvedValue(null);
      provider.initialize.mockResolvedValue({
        providerReference: 'pay_123',
        status: 'SUCCEEDED',
        gatewayStatus: 'SUCCESS',
      });

      const result = await service.initializeForOrder(order);

      expect(ordersService.confirmPayment).toHaveBeenCalledWith(
        'order-1',
        expect.anything(),
      );
      expect(result.status).toBe(PaymentStatus.SUCCEEDED);
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
        data: { providerReference: 'ref-1' },
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

  describe('refundSellerOrder', () => {
    it.each(['PENDING', 'PROCESSING', 'FAILED', 'CANCELLED'] as const)(
      'does not apply a %s refund to balances or inventory',
      async (status) => {
        provider.refund.mockResolvedValue({
          providerReference: 'remote-refund',
          status,
        });
        await expect(
          service.refundSellerOrder('so-1', 400, 'Customer request', 'key'),
        ).resolves.toMatchObject({ status });
        expect(ordersService.applyRefund).not.toHaveBeenCalled();
        expect(ledgerService.recordRefundReversal).not.toHaveBeenCalled();
        expect(prisma.payment.update).not.toHaveBeenCalled();
      },
    );
    it('uses the same transaction for every successful local effect', async () => {
      provider.refund.mockResolvedValue({
        providerReference: 'remote-refund',
        status: 'SUCCEEDED',
      });
      await expect(
        service.refundSellerOrder('so-1', 400, 'Customer request', 'key'),
      ).resolves.toMatchObject({ status: 'SUCCEEDED' });
      expect(ordersService.applyRefund).toHaveBeenCalledWith(
        'so-1',
        400,
        prisma,
      );
      expect(ledgerService.recordRefundReversal).toHaveBeenCalledWith(
        sellerOrder,
        400,
        'refund-1',
        prisma,
      );
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: { refundedAmount: 400, status: 'PARTIALLY_REFUNDED' },
      });
    });
    it('counts pending refunds against available capacity before contacting the provider', async () => {
      prisma.refund.findMany.mockResolvedValue([
        { sellerOrderId: 'so-1', amount: 700 },
      ]);
      await expect(
        service.refundSellerOrder('so-1', 400, 'Customer request', 'key'),
      ).rejects.toThrow('remaining refundable balance');
      expect(refundCall).not.toHaveBeenCalled();
    });
    it('returns the existing request on an idempotent retry without a second provider call', async () => {
      prisma.refund.findUnique.mockResolvedValue(pending);
      await expect(
        service.refundSellerOrder('so-1', 400, 'Customer request', 'key'),
      ).resolves.toEqual(pending);
      expect(refundCall).not.toHaveBeenCalled();
      expect(prisma.refund.create).not.toHaveBeenCalled();
    });
    it('rejects reuse of an idempotency key for different input', async () => {
      prisma.refund.findUnique.mockResolvedValue({ ...pending, amount: 200 });
      await expect(
        service.refundSellerOrder('so-1', 400, 'Customer request', 'key'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(refundCall).not.toHaveBeenCalled();
    });
    it('keeps refund capacity reserved after a timeout', async () => {
      provider.refund.mockRejectedValue(new PaymentOutcomeUnknownException());
      await expect(
        service.refundSellerOrder('so-1', 400, 'Customer request', 'key'),
      ).rejects.toBeInstanceOf(PaymentOutcomeUnknownException);
      expect(prisma.refund.update).toHaveBeenCalledWith({
        where: { id: 'refund-1' },
        data: {
          status: 'PENDING',
          failureReason: 'Refund outcome requires reconciliation',
        },
      });
    });
    it('releases refund capacity for a definitively unsupported operation', async () => {
      provider.refund.mockRejectedValue(new NotImplementedException());
      await expect(
        service.refundSellerOrder('so-1', 400, 'Customer request', 'key'),
      ).rejects.toBeInstanceOf(NotImplementedException);
      expect(prisma.refund.update).toHaveBeenCalledWith({
        where: { id: 'refund-1' },
        data: {
          status: 'FAILED',
          failureReason: 'Provider rejected this refund operation',
        },
      });
    });
    it('retains the provider reference for reconciliation when local finalization fails', async () => {
      provider.refund.mockResolvedValue({
        providerReference: 'remote-refund',
        status: 'SUCCEEDED',
      });
      ordersService.applyRefund.mockRejectedValue(
        new Error('Stock unavailable'),
      );
      await expect(
        service.refundSellerOrder('so-1', 400, 'Customer request', 'key'),
      ).rejects.toThrow('Stock unavailable');
      expect(prisma.refund.update).toHaveBeenCalledTimes(1);
      expect(prisma.refund.update).toHaveBeenCalledWith({
        where: { id: 'refund-1' },
        data: { providerReference: 'remote-refund' },
      });
    });
  });
  describe('handleWebhook', () => {
    beforeEach(() => {
      prisma.payment.findUniqueOrThrow.mockResolvedValue({
        ...payment,
        status: 'PENDING',
      });
      provider.verifyWebhook.mockReturnValue({
        id: 'evt-1',
        providerReference: 'pay_123',
        type: 'payment.succeeded',
        status: 'SUCCEEDED',
        payload: {},
      });
    });
    it('deduplicates events by payment', async () => {
      prisma.paymentEvent.findUnique.mockResolvedValue({
        paymentId: 'payment-1',
      });
      await service.handleWebhook(Buffer.from('{}'), 'sig');
      expect(ordersService.confirmPayment).not.toHaveBeenCalled();
    });
    it('commits order effects and the event in the same transaction', async () => {
      await service.handleWebhook(Buffer.from('{}'), 'sig');
      expect(ordersService.confirmPayment).toHaveBeenCalledWith(
        'order-1',
        prisma,
      );
      expect(prisma.paymentEvent.create).toHaveBeenCalled();
    });
    it('leaves no dedupe event when business effects fail', async () => {
      ordersService.confirmPayment.mockRejectedValue(
        new Error('Stock unavailable'),
      );
      await expect(
        service.handleWebhook(Buffer.from('{}'), 'sig'),
      ).rejects.toThrow('Stock unavailable');
      expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
    });
    it('does not downgrade a settled payment on a stale failure event', async () => {
      prisma.payment.findUniqueOrThrow.mockResolvedValue(payment);
      provider.verifyWebhook.mockReturnValue({
        id: 'evt-2',
        providerReference: 'pay_123',
        type: 'payment.failed',
        status: 'FAILED',
        payload: {},
      });
      await service.handleWebhook(Buffer.from('{}'), 'sig');
      expect(ordersService.cancel).not.toHaveBeenCalled();
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });
  });

  describe('reconcile', () => {
    const unsettled = {
      ...payment,
      status: PaymentStatus.PENDING,
      failureReason: null,
    };

    beforeEach(() => {
      prisma.payment.findUniqueOrThrow.mockResolvedValue(unsettled);
      prisma.payment.findUnique.mockResolvedValue(unsettled);
      prisma.paymentEvent.findUnique.mockResolvedValue(null);
    });

    // The case that left a paid order stuck: the gateway had settled it and
    // nothing here acted on that.
    it('settles the order when the gateway reports a success', async () => {
      getPaymentCall.mockResolvedValue({
        providerReference: 'pay_123',
        status: 'SUCCEEDED',
        gatewayStatus: 'SUCCESS',
      });

      await service.reconcile('payment-1');

      expect(ordersService.confirmPayment).toHaveBeenCalledWith(
        'order-1',
        expect.anything(),
      );
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: { status: PaymentStatus.SUCCEEDED, failureReason: null },
      });
    });

    it('keeps the failure detail the gateway gives for a failed payment', async () => {
      getPaymentCall.mockResolvedValue({
        providerReference: 'pay_123',
        status: 'FAILED',
        gatewayStatus: 'FAILED',
        failureCode: 'INSUFFICIENT_FUNDS',
        failureMessage: 'Balance too low',
      });

      await service.reconcile('payment-1');

      expect(ordersService.cancel).toHaveBeenCalledWith(
        'order-1',
        expect.anything(),
      );
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: 'INSUFFICIENT_FUNDS: Balance too low',
        },
      });
    });

    // An unrecognised status must never be read as an outcome: the gateway
    // documents no enum, so guessing would either release goods for nothing
    // or cancel an order that is about to be paid.
    it('changes nothing when the gateway status is not one it knows', async () => {
      getPaymentCall.mockResolvedValue({
        providerReference: 'pay_123',
        status: 'PENDING',
        gatewayStatus: 'AWAITING_SUBSCRIBER',
      });

      await service.reconcile('payment-1');

      expect(ordersService.confirmPayment).not.toHaveBeenCalled();
      expect(ordersService.cancel).not.toHaveBeenCalled();
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    // Orders left behind by a checkout that settled inline before that path
    // applied its outcome; the fix converges rather than needing a migration.
    it('advances an order whose payment already settled, without calling the gateway', async () => {
      prisma.payment.findUniqueOrThrow.mockResolvedValue({
        ...unsettled,
        status: PaymentStatus.SUCCEEDED,
      });

      await service.reconcile('payment-1');

      expect(ordersService.confirmPayment).toHaveBeenCalledWith('order-1');
      expect(getPaymentCall).not.toHaveBeenCalled();
    });

    it('does not ask the gateway about a payment that has already settled', async () => {
      prisma.payment.findUniqueOrThrow.mockResolvedValue(payment);

      await service.reconcile('payment-1');

      expect(getPaymentCall).not.toHaveBeenCalled();
    });
  });
});
