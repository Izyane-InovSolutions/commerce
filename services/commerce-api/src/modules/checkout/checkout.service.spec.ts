import { CartService } from '../cart/cart.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutService } from './checkout.service';

describe('CheckoutService', () => {
  let ordersService: { createFromCart: jest.Mock; cancel: jest.Mock };
  let paymentsService: { initializeForOrder: jest.Mock };
  let cartService: { clearCart: jest.Mock };
  let service: CheckoutService;

  beforeEach(() => {
    ordersService = { createFromCart: jest.fn(), cancel: jest.fn() };
    paymentsService = { initializeForOrder: jest.fn() };
    cartService = { clearCart: jest.fn() };
    service = new CheckoutService(
      ordersService as unknown as OrdersService,
      paymentsService as unknown as PaymentsService,
      cartService as unknown as CartService,
    );
  });

  it('clears the cart once payment initialization succeeds', async () => {
    ordersService.createFromCart.mockResolvedValue({ id: 'order-1' });
    paymentsService.initializeForOrder.mockResolvedValue({ id: 'payment-1' });

    const result = await service.checkout('user-1', 'addr-1', 'USD');

    expect(cartService.clearCart).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(ordersService.cancel).not.toHaveBeenCalled();
    expect(result).toEqual({
      order: { id: 'order-1' },
      payment: { id: 'payment-1' },
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

  it('does not cancel an accepted payment when clearing the cart fails', async () => {
    ordersService.createFromCart.mockResolvedValue({ id: 'order-1' });
    paymentsService.initializeForOrder.mockResolvedValue({ id: 'payment-1' });
    cartService.clearCart.mockRejectedValue(new Error('Database unavailable'));
    await expect(service.checkout('user-1', 'addr-1', 'USD')).rejects.toThrow(
      'Database unavailable',
    );
    expect(ordersService.cancel).not.toHaveBeenCalled();
  });
});
