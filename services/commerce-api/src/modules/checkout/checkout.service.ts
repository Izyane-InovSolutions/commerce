import { Injectable } from '@nestjs/common';

import { CartService } from '../cart/cart.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutResult } from './checkout.types';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly cartService: CartService,
  ) {}

  async checkout(
    userId: string,
    dto: CreateCheckoutDto,
  ): Promise<CheckoutResult> {
    const order = await this.ordersService.createFromCart(
      userId,
      dto.shippingAddressId,
    );

    try {
      const payment = await this.paymentsService.initializeForOrder(order, {
        paymentMethod: dto.paymentMethod,
        phoneNumber: dto.phoneNumber,
        provider: dto.provider,
        card: dto.card,
        description: `Payment for order ${order.id}`,
        metadata: {
          orderId: order.id,
          channel: 'web',
        },
      });
      await this.cartService.clearCart({ userId });
      return { order, payment };
    } catch (error) {
      // Cart is left untouched here so the customer can retry checkout.
      await this.ordersService.cancel(order.id);
      throw error;
    }
  }
}
