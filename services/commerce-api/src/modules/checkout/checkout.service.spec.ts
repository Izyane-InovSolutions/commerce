import { BadRequestException } from '@nestjs/common';

import { CartService } from '../cart/cart.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutAttemptSupersededError } from './checkout-attempt.errors';
import { CheckoutAttemptsService } from './checkout-attempts.service';
import { CheckoutService } from './checkout.service';
import type { CheckoutAttemptContext } from './checkout.types';

const KEY = {
  key: '9b2f4c8e-1d3a-4f5b-9c7d-2e8f6a1b3c4d',
  rawKey: '9B2F4C8E-1D3A-4F5B-9C7D-2E8F6A1B3C4D',
};

function firstCallOrder(mock: jest.Mock): number {
  return mock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
}

describe('CheckoutService', () => {
  let ordersService: {
    createFromCart: jest.Mock;
    createFromOffer: jest.Mock;
    findForCheckout: jest.Mock;
    cancel: jest.Mock;
    findOwn: jest.Mock;
  };
  let paymentsService: {
    initializeForOrder: jest.Mock;
    findForOrder: jest.Mock;
  };
  let cartService: { cleanUpCheckout: jest.Mock };
  let attempts: {
    run: jest.Mock;
    markPaymentStarted: jest.Mock;
    complete: jest.Mock;
  };
  let context: CheckoutAttemptContext;
  let service: CheckoutService;

  beforeEach(() => {
    ordersService = {
      createFromCart: jest.fn().mockResolvedValue({ id: 'order-1' }),
      createFromOffer: jest.fn().mockResolvedValue({ id: 'order-1' }),
      findForCheckout: jest.fn(),
      cancel: jest.fn(),
      findOwn: jest.fn(),
    };
    paymentsService = {
      initializeForOrder: jest.fn(),
      findForOrder: jest.fn().mockResolvedValue(null),
    };
    cartService = { cleanUpCheckout: jest.fn() };
    context = { attemptId: 'attempt-1', ownerToken: 'owner-1' };
    // The attempt lifecycle itself is CheckoutAttemptsService's; here it
    // only hands execution the context a keyed request would own.
    attempts = {
      run: jest.fn(
        (
          _userId: string,
          key: unknown,
          _request: unknown,
          execute: (ctx: CheckoutAttemptContext | null) => Promise<unknown>,
        ) => execute(key ? context : null),
      ),
      markPaymentStarted: jest.fn(),
      complete: jest.fn(),
    };
    service = new CheckoutService(
      ordersService as unknown as OrdersService,
      paymentsService as unknown as PaymentsService,
      cartService as unknown as CartService,
      attempts as unknown as CheckoutAttemptsService,
    );
  });

  describe('without an Idempotency-Key', () => {
    it('cleans up the checked-out cart lines once payment initialization succeeds', async () => {
      paymentsService.initializeForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'SUCCEEDED',
      });

      const result = await service.checkout('user-1', 'addr-1', 'USD');

      expect(ordersService.createFromCart).toHaveBeenCalledWith(
        'user-1',
        'addr-1',
        'USD',
        undefined,
        undefined,
        undefined,
      );
      expect(cartService.cleanUpCheckout).toHaveBeenCalledWith(
        'user-1',
        'order-1',
      );
      expect(attempts.markPaymentStarted).not.toHaveBeenCalled();
      expect(attempts.complete).not.toHaveBeenCalled();
      expect(result).toEqual({
        order: { id: 'order-1' },
        payment: { id: 'payment-1', status: 'SUCCEEDED' },
      });
    });

    it('cancels the order and leaves the cart alone when payment fails before a payment row exists', async () => {
      const error = new Error('Database unavailable');
      paymentsService.initializeForOrder.mockRejectedValue(error);

      await expect(service.checkout('user-1', 'addr-1', 'USD')).rejects.toBe(
        error,
      );

      expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
      expect(cartService.cleanUpCheckout).not.toHaveBeenCalled();
    });

    it('keeps the order when its payment may still be pending at the gateway', async () => {
      const error = new Error('Database unavailable');
      paymentsService.initializeForOrder.mockRejectedValue(error);
      paymentsService.findForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
      });

      await expect(service.checkout('user-1', 'addr-1', 'USD')).rejects.toBe(
        error,
      );

      expect(ordersService.cancel).not.toHaveBeenCalled();
    });

    it('still reports the payment error when cancelling the order fails', async () => {
      const error = new Error('Payment gateway rejected the charge');
      paymentsService.initializeForOrder.mockRejectedValue(error);
      ordersService.cancel.mockRejectedValue(new Error('lock timeout'));

      await expect(service.checkout('user-1', 'addr-1', 'USD')).rejects.toBe(
        error,
      );
    });

    it('does not fail an accepted payment when cart cleanup fails', async () => {
      paymentsService.initializeForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'SUCCEEDED',
      });
      cartService.cleanUpCheckout.mockRejectedValue(
        new Error('Database unavailable'),
      );

      const result = await service.checkout('user-1', 'addr-1', 'USD');

      expect(ordersService.cancel).not.toHaveBeenCalled();
      expect(result).toEqual({
        order: { id: 'order-1' },
        payment: { id: 'payment-1', status: 'SUCCEEDED' },
      });
    });

    it('preserves the cart and returns the cancelled order when the gateway declines inline', async () => {
      paymentsService.initializeForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'FAILED',
      });
      ordersService.findOwn.mockResolvedValue({
        id: 'order-1',
        status: 'CANCELLED',
      });

      const result = await service.checkout('user-1', 'addr-1', 'USD');

      expect(cartService.cleanUpCheckout).not.toHaveBeenCalled();
      expect(ordersService.cancel).not.toHaveBeenCalled();
      expect(ordersService.findOwn).toHaveBeenCalledWith('user-1', 'order-1');
      expect(result).toEqual({
        order: { id: 'order-1', status: 'CANCELLED' },
        payment: { id: 'payment-1', status: 'FAILED' },
      });
    });
  });

  describe('with an Idempotency-Key', () => {
    it('fingerprints the validated request and links the order under the attempt fence', async () => {
      paymentsService.initializeForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
      });

      await service.checkout(
        'user-1',
        'ADDR-1',
        'USD',
        undefined,
        ['ITEM-2', 'item-1', 'item-2'],
        KEY,
      );

      expect(attempts.run).toHaveBeenCalledWith(
        'user-1',
        KEY,
        {
          operation: 'cart',
          shippingAddressId: 'addr-1',
          currency: 'USD',
          itemIds: ['item-1', 'item-2'],
          paymentDetails: null,
        },
        expect.any(Function),
      );
      // Executed from the normalized request the fingerprint covers.
      expect(ordersService.createFromCart).toHaveBeenCalledWith(
        'user-1',
        'addr-1',
        'USD',
        ['item-1', 'item-2'],
        KEY.key,
        { id: 'attempt-1', ownerToken: 'owner-1' },
      );
    });

    it('marks payment started inside the payment insert and records the result before cart cleanup', async () => {
      const payment = { id: 'payment-1', status: 'PENDING' };
      paymentsService.initializeForOrder.mockImplementation(
        async (
          _order: unknown,
          _details: unknown,
          guard?: (tx: unknown) => Promise<void>,
        ) => {
          await guard?.('tx');
          return payment;
        },
      );

      const result = await service.checkout(
        'user-1',
        'addr-1',
        'USD',
        undefined,
        undefined,
        KEY,
      );

      expect(attempts.markPaymentStarted).toHaveBeenCalledWith(
        context,
        'order-1',
        'tx',
      );
      expect(attempts.complete).toHaveBeenCalledWith(context, 'order-1', {
        order: { id: 'order-1' },
        payment,
      });
      expect(firstCallOrder(attempts.complete)).toBeLessThan(
        firstCallOrder(cartService.cleanUpCheckout),
      );
      expect(result).toEqual({ order: { id: 'order-1' }, payment });
    });

    it('leaves the order to the new owner when the attempt was taken over', async () => {
      const superseded = new CheckoutAttemptSupersededError();
      attempts.markPaymentStarted.mockRejectedValue(superseded);
      paymentsService.initializeForOrder.mockImplementation(
        async (
          _order: unknown,
          _details: unknown,
          guard?: (tx: unknown) => Promise<void>,
        ) => {
          await guard?.('tx');
          return { id: 'payment-1' };
        },
      );

      await expect(
        service.checkout('user-1', 'addr-1', 'USD', undefined, undefined, KEY),
      ).rejects.toBe(superseded);

      expect(paymentsService.findForOrder).not.toHaveBeenCalled();
      expect(ordersService.cancel).not.toHaveBeenCalled();
    });

    it('keeps the order for a resume after a transient error before any payment row', async () => {
      const error = new Error('Database unavailable');
      paymentsService.initializeForOrder.mockRejectedValue(error);

      await expect(
        service.checkout('user-1', 'addr-1', 'USD', undefined, undefined, KEY),
      ).rejects.toBe(error);

      expect(ordersService.cancel).not.toHaveBeenCalled();
      expect(attempts.complete).not.toHaveBeenCalled();
    });

    it('cancels the order on a definite refusal before any payment row', async () => {
      const error = new BadRequestException('Invalid payment details');
      paymentsService.initializeForOrder.mockRejectedValue(error);

      await expect(
        service.checkout('user-1', 'addr-1', 'USD', undefined, undefined, KEY),
      ).rejects.toBe(error);

      expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
    });

    it('cancels the order once its payment row has failed', async () => {
      const error = new Error('Gateway refused the connection');
      paymentsService.initializeForOrder.mockRejectedValue(error);
      paymentsService.findForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'FAILED',
      });

      await expect(
        service.checkout('user-1', 'addr-1', 'USD', undefined, undefined, KEY),
      ).rejects.toBe(error);

      expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
    });

    it('resumes the order an interrupted attempt created instead of creating another', async () => {
      context = { ...context, resumeOrderId: 'order-0' };
      ordersService.findForCheckout.mockResolvedValue({ id: 'order-0' });
      paymentsService.initializeForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
      });

      const result = await service.checkout(
        'user-1',
        'addr-1',
        'USD',
        undefined,
        undefined,
        KEY,
      );

      expect(ordersService.createFromCart).not.toHaveBeenCalled();
      expect(paymentsService.initializeForOrder).toHaveBeenCalledWith(
        { id: 'order-0' },
        undefined,
        expect.any(Function),
      );
      expect(attempts.complete).toHaveBeenCalledWith(
        context,
        'order-0',
        result,
      );
      expect(cartService.cleanUpCheckout).toHaveBeenCalledWith(
        'user-1',
        'order-0',
      );
    });
  });

  describe('checkoutOffer', () => {
    it('never touches the cart on success', async () => {
      paymentsService.initializeForOrder.mockResolvedValue({
        id: 'payment-1',
      });

      const result = await service.checkoutOffer(
        'user-1',
        'offer-1',
        2,
        'addr-1',
        'USD',
      );

      expect(ordersService.createFromOffer).toHaveBeenCalledWith(
        'user-1',
        'offer-1',
        2,
        'addr-1',
        'USD',
        undefined,
        undefined,
      );
      expect(cartService.cleanUpCheckout).not.toHaveBeenCalled();
      expect(ordersService.cancel).not.toHaveBeenCalled();
      expect(result).toEqual({
        order: { id: 'order-1' },
        payment: { id: 'payment-1' },
      });
    });

    it('fingerprints a buy-now request separately from a cart checkout', async () => {
      paymentsService.initializeForOrder.mockResolvedValue({
        id: 'payment-1',
      });

      await service.checkoutOffer(
        'user-1',
        'OFFER-1',
        3,
        'addr-1',
        'USD',
        undefined,
        KEY,
      );

      expect(attempts.run).toHaveBeenCalledWith(
        'user-1',
        KEY,
        {
          operation: 'buy-now',
          offerId: 'offer-1',
          quantity: 3,
          shippingAddressId: 'addr-1',
          currency: 'USD',
          paymentDetails: null,
        },
        expect.any(Function),
      );
      expect(ordersService.createFromOffer).toHaveBeenCalledWith(
        'user-1',
        'offer-1',
        3,
        'addr-1',
        'USD',
        KEY.key,
        { id: 'attempt-1', ownerToken: 'owner-1' },
      );
      expect(cartService.cleanUpCheckout).not.toHaveBeenCalled();
    });

    it('cancels the order when payment initialization fails', async () => {
      const error = new Error('Payment gateway rejected the charge');
      paymentsService.initializeForOrder.mockRejectedValue(error);

      await expect(
        service.checkoutOffer('user-1', 'offer-1', 1, 'addr-1', 'USD'),
      ).rejects.toBe(error);

      expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
    });
  });
});
