import { CartService } from '../cart/cart.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutService } from './checkout.service';
import type { CreateCheckoutDto } from './dto/create-checkout.dto';

describe('CheckoutService', () => {
  let ordersService: { createFromCart: jest.Mock; cancel: jest.Mock };
  let paymentsService: { initializeForOrder: jest.Mock };
  let cartService: { clearCart: jest.Mock };
  let service: CheckoutService;

  const checkoutDto: CreateCheckoutDto = {
    shippingAddressId: 'addr-1',
    paymentMethod: 'MOBILE_MONEY',
    phoneNumber: '0977123456',
    provider: 'AIRTEL',
  };

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

    const result = await service.checkout('user-1', checkoutDto);

    expect(ordersService.createFromCart).toHaveBeenCalledWith('user-1', 'addr-1');
    expect(paymentsService.initializeForOrder).toHaveBeenCalledWith(
      { id: 'order-1' },
      expect.objectContaining({
        paymentMethod: 'MOBILE_MONEY',
        phoneNumber: '0977123456',
        provider: 'AIRTEL',
      }),
    );
    expect(cartService.clearCart).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(ordersService.cancel).not.toHaveBeenCalled();
    expect(result).toEqual({
      order: { id: 'order-1' },
      payment: { id: 'payment-1' },
    });
  });

  it('cancels the order and leaves the cart alone when payment initialization fails', async () => {
    ordersService.createFromCart.mockResolvedValue({ id: 'order-1' });
    const error = new Error('Unified Payments rejected the payment request');
    paymentsService.initializeForOrder.mockRejectedValue(error);

    await expect(service.checkout('user-1', checkoutDto)).rejects.toThrow(error);

    expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
    expect(cartService.clearCart).not.toHaveBeenCalled();
  });
});
