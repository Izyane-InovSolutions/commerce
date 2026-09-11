import { Injectable } from '@nestjs/common';

import { CartService } from '../cart/cart.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutResult } from './checkout.types';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly cartService: CartService,
  ) {}

  async checkout(
    userId: string,
    shippingAddressId: string,
  ): Promise<CheckoutResult> {
    const order = await this.ordersService.createFromCart(
      userId,
      shippingAddressId,
    );

    try {
      const payment = await this.paymentsService.initializeForOrder(order);
      await this.cartService.clearCart({ userId });
      return { order, payment };
    } catch (error) {
      // Cart is left untouched here so the customer can retry checkout.
      await this.ordersService.cancel(order.id);
      throw error;
    }
  }
}
