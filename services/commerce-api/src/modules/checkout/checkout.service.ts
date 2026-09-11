import { Injectable } from '@nestjs/common';

import { CartService } from '../cart/cart.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import type { PaymentWithRedirect } from '../payments/payments.service';
import { CheckoutResult } from './checkout.types';
import type { PaymentDetailsDto } from '../payments/dto/payment-details.dto';

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
    paymentDetails?: PaymentDetailsDto,
  ): Promise<CheckoutResult> {
    const order = await this.ordersService.createFromCart(
      userId,
      shippingAddressId,
    );

    let payment: PaymentWithRedirect;
    try {
      payment = await this.paymentsService.initializeForOrder(
        order,
        paymentDetails,
      );
    } catch (error) {
      // Cart is left untouched here so the customer can retry checkout.
      await this.ordersService.cancel(order.id);
      throw error;
    }
    // A cart write failure cannot undo a charge already accepted by the gateway.
    await this.cartService.clearCart({ userId });
    return { order, payment };
  }
}
