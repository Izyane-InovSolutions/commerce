import { BackgroundJobsService } from '../../infrastructure/jobs/background-jobs.service';
import { CART_CLEANUP_JOB_TYPE } from '../cart/jobs/cart-cleanup.handler';
import { CartService } from '../cart/cart.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutService } from './checkout.service';

describe('CheckoutService', () => {
  let ordersService: {
    createFromCart: jest.Mock;
    createFromOffer: jest.Mock;
    cancel: jest.Mock;
    findByIdempotencyKey: jest.Mock;
    releaseIdempotencyKey: jest.Mock;
    findOwn: jest.Mock;
  };
  let paymentsService: {
    initializeForOrder: jest.Mock;
    getForOrder: jest.Mock;
  };
  let cartService: { clearCart: jest.Mock; removeItems: jest.Mock };
  let backgroundJobsService: { enqueue: jest.Mock };
  let service: CheckoutService;

  beforeEach(() => {
    ordersService = {
      createFromCart: jest.fn(),
      createFromOffer: jest.fn(),
      cancel: jest.fn(),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      releaseIdempotencyKey: jest.fn(),
      findOwn: jest.fn(),
    };
    paymentsService = {
      initializeForOrder: jest.fn(),
      getForOrder: jest.fn(),
    };
    cartService = { clearCart: jest.fn(), removeItems: jest.fn() };
    backgroundJobsService = { enqueue: jest.fn() };
    service = new CheckoutService(
      ordersService as unknown as OrdersService,
      paymentsService as unknown as PaymentsService,
      cartService as unknown as CartService,
      backgroundJobsService as unknown as BackgroundJobsService,
    );
  });

  it('clears the cart once payment initialization succeeds', async () => {
    ordersService.createFromCart.mockResolvedValue({ id: 'order-1' });
    paymentsService.initializeForOrder.mockResolvedValue({
      id: 'payment-1',
      status: 'SUCCEEDED',
    });

    const result = await service.checkout('user-1', 'addr-1', 'USD');

    expect(cartService.clearCart).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(ordersService.cancel).not.toHaveBeenCalled();
    expect(result).toEqual({
      order: { id: 'order-1' },
      payment: { id: 'payment-1', status: 'SUCCEEDED' },
    });
  });

  it('cancels the order and leaves the cart alone when payment initialization fails', async () => {
    ordersService.createFromCart.mockResolvedValue({ id: 'order-1' });
    const error = new Error(
      'Payment integration is awaiting the external provider API',
    );
    paymentsService.initializeForOrder.mockRejectedValue(error);

    await expect(service.checkout('user-1', 'addr-1', 'USD')).rejects.toThrow(
      error,
    );

    expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
    expect(cartService.clearCart).not.toHaveBeenCalled();
  });

  it('does not cancel or fail an accepted payment when clearing the cart fails, retrying via a background job instead', async () => {
    ordersService.createFromCart.mockResolvedValue({ id: 'order-1' });
    paymentsService.initializeForOrder.mockResolvedValue({
      id: 'payment-1',
      status: 'SUCCEEDED',
    });
    cartService.clearCart.mockRejectedValue(new Error('Database unavailable'));

    const result = await service.checkout('user-1', 'addr-1', 'USD');

    expect(ordersService.cancel).not.toHaveBeenCalled();
    expect(backgroundJobsService.enqueue).toHaveBeenCalledWith({
      type: CART_CLEANUP_JOB_TYPE,
      payload: { userId: 'user-1', itemIds: [] },
    });
    expect(result).toEqual({
      order: { id: 'order-1' },
      payment: { id: 'payment-1', status: 'SUCCEEDED' },
    });
  });

  it('preserves the cart and returns the cancelled order when the gateway declines inline', async () => {
    ordersService.createFromCart.mockResolvedValue({ id: 'order-1' });
    paymentsService.initializeForOrder.mockResolvedValue({
      id: 'payment-1',
      status: 'FAILED',
    });
    ordersService.findOwn.mockResolvedValue({
      id: 'order-1',
      status: 'CANCELLED',
    });

    const result = await service.checkout('user-1', 'addr-1', 'USD');

    expect(cartService.clearCart).not.toHaveBeenCalled();
    expect(cartService.removeItems).not.toHaveBeenCalled();
    expect(ordersService.cancel).not.toHaveBeenCalled();
    expect(ordersService.findOwn).toHaveBeenCalledWith('user-1', 'order-1');
    expect(result).toEqual({
      order: { id: 'order-1', status: 'CANCELLED' },
      payment: { id: 'payment-1', status: 'FAILED' },
    });
  });

  describe('partial checkout (itemIds)', () => {
    it('removes only the checked-out lines, leaving the rest of the cart alone', async () => {
      ordersService.createFromCart.mockResolvedValue({ id: 'order-1' });
      paymentsService.initializeForOrder.mockResolvedValue({ id: 'payment-1' });

      await service.checkout('user-1', 'addr-1', 'USD', undefined, [
        'item-1',
        'item-2',
      ]);

      expect(ordersService.createFromCart).toHaveBeenCalledWith(
        'user-1',
        'addr-1',
        'USD',
        ['item-1', 'item-2'],
        undefined,
      );
      expect(cartService.removeItems).toHaveBeenCalledWith(
        { userId: 'user-1' },
        ['item-1', 'item-2'],
      );
      expect(cartService.clearCart).not.toHaveBeenCalled();
    });

    it('leaves the cart untouched when payment initialization fails', async () => {
      ordersService.createFromCart.mockResolvedValue({ id: 'order-1' });
      paymentsService.initializeForOrder.mockRejectedValue(
        new Error('Payment gateway rejected the charge'),
      );

      await expect(
        service.checkout('user-1', 'addr-1', 'USD', undefined, ['item-1']),
      ).rejects.toThrow('Payment gateway rejected the charge');

      expect(cartService.removeItems).not.toHaveBeenCalled();
      expect(cartService.clearCart).not.toHaveBeenCalled();
      expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
    });
  });

  describe('checkoutOffer', () => {
    it('never reads or clears the cart on success', async () => {
      ordersService.createFromOffer.mockResolvedValue({ id: 'order-1' });
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
      );
      expect(cartService.clearCart).not.toHaveBeenCalled();
      expect(ordersService.cancel).not.toHaveBeenCalled();
      expect(result).toEqual({
        order: { id: 'order-1' },
        payment: { id: 'payment-1' },
      });
    });

    it('cancels the order when payment initialization fails', async () => {
      ordersService.createFromOffer.mockResolvedValue({ id: 'order-1' });
      const error = new Error('Payment gateway rejected the charge');
      paymentsService.initializeForOrder.mockRejectedValue(error);

      await expect(
        service.checkoutOffer('user-1', 'offer-1', 1, 'addr-1', 'USD'),
      ).rejects.toThrow(error);

      expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
      expect(cartService.clearCart).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('replays the order and payment already created for this key, without checking out again', async () => {
      ordersService.findByIdempotencyKey.mockResolvedValue({
        id: 'order-1',
        payment: { id: 'payment-1', status: 'PENDING' },
      });
      paymentsService.getForOrder.mockResolvedValue({ id: 'payment-1' });

      const result = await service.checkout(
        'user-1',
        'addr-1',
        'USD',
        undefined,
        undefined,
        'key-1',
      );

      expect(ordersService.findByIdempotencyKey).toHaveBeenCalledWith(
        'user-1',
        'key-1',
      );
      expect(paymentsService.getForOrder).toHaveBeenCalledWith('order-1');
      expect(ordersService.createFromCart).not.toHaveBeenCalled();
      expect(cartService.clearCart).not.toHaveBeenCalled();
      expect(result).toEqual({
        order: {
          id: 'order-1',
          payment: { id: 'payment-1', status: 'PENDING' },
        },
        payment: { id: 'payment-1' },
      });
    });

    it('frees the key and checks out fresh when a prior order never reached payment', async () => {
      ordersService.findByIdempotencyKey.mockResolvedValue({
        id: 'dead-order',
        payment: null,
      });
      ordersService.createFromCart.mockResolvedValue({ id: 'order-2' });
      paymentsService.initializeForOrder.mockResolvedValue({ id: 'payment-2' });

      const result = await service.checkout(
        'user-1',
        'addr-1',
        'USD',
        undefined,
        undefined,
        'key-1',
      );

      expect(ordersService.releaseIdempotencyKey).toHaveBeenCalledWith(
        'dead-order',
      );
      expect(ordersService.createFromCart).toHaveBeenCalledWith(
        'user-1',
        'addr-1',
        'USD',
        undefined,
        'key-1',
      );
      expect(result).toEqual({
        order: { id: 'order-2' },
        payment: { id: 'payment-2' },
      });
    });
  });
});
