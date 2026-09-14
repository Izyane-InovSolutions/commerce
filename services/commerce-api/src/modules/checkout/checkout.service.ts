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

  /**
   * `itemIds`, when given, checks out only those cart lines and leaves the
   * rest of the cart alone — a shopper can pay for part of what they picked
   * without losing track of the rest. Omitted, it is every line in the cart,
   * same as before partial checkout existed.
   */
  async checkout(
    userId: string,
    shippingAddressId: string,
    currency: string,
    paymentDetails?: PaymentDetailsDto,
    itemIds?: string[],
  ): Promise<CheckoutResult> {
    const order = await this.ordersService.createFromCart(
      userId,
      shippingAddressId,
      currency,
      itemIds,
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
    if (itemIds && itemIds.length > 0) {
      await this.cartService.removeItems({ userId }, itemIds);
    } else {
      await this.cartService.clearCart({ userId });
    }
    return { order, payment };
  }

  /**
   * "Buy now": checks one offer out directly, at its own quantity. The
   * persisted cart is never read or written, so there is nothing to clear
   * afterwards and nothing in it to fail on.
   */
  async checkoutOffer(
    userId: string,
    offerId: string,
    quantity: number,
    shippingAddressId: string,
    currency: string,
    paymentDetails?: PaymentDetailsDto,
  ): Promise<CheckoutResult> {
    const order = await this.ordersService.createFromOffer(
      userId,
      offerId,
      quantity,
      shippingAddressId,
      currency,
    );

    let payment: PaymentWithRedirect;
    try {
      payment = await this.paymentsService.initializeForOrder(
        order,
        paymentDetails,
      );
    } catch (error) {
      await this.ordersService.cancel(order.id);
      throw error;
    }
    return { order, payment };
  }
}
