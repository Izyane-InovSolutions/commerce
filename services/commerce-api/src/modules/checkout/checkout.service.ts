import { Injectable, Logger } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';

import { BackgroundJobsService } from '../../infrastructure/jobs/background-jobs.service';
import { CartService } from '../cart/cart.service';
import { CART_CLEANUP_JOB_TYPE } from '../cart/jobs/cart-cleanup.handler';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import type { PaymentWithRedirect } from '../payments/payments.service';
import { CheckoutResult } from './checkout.types';
import type { PaymentDetailsDto } from '../payments/dto/payment-details.dto';

/** A payment that will never accept a charge; nothing was taken from the customer. */
const TERMINAL_FAILURE_STATUSES: PaymentStatus[] = [
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
];

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly cartService: CartService,
    private readonly backgroundJobsService: BackgroundJobsService,
  ) {}

  /**
   * `itemIds`, when given, checks out only those cart lines and leaves the
   * rest of the cart alone — a shopper can pay for part of what they picked
   * without losing track of the rest. Omitted, it is every line in the cart,
   * same as before partial checkout existed.
   *
   * `idempotencyKey`, when given, makes a retried call — a double submit, or
   * a retry after a timeout — return the order that call already created
   * instead of checking out a second time.
   */
  async checkout(
    userId: string,
    shippingAddressId: string,
    currency: string,
    paymentDetails?: PaymentDetailsDto,
    itemIds?: string[],
    idempotencyKey?: string,
  ): Promise<CheckoutResult> {
    const replay = await this.replay(userId, idempotencyKey);
    if (replay) return replay;

    const order = await this.ordersService.createFromCart(
      userId,
      shippingAddressId,
      currency,
      itemIds,
      idempotencyKey,
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

    // A gateway that settles inline can come back already declined; the
    // order is already cancelled by then (see PaymentsService.applyEvent),
    // so the cart must be preserved, not cleared, and the caller needs the
    // cancelled order rather than the stale pending one it was created as.
    if (TERMINAL_FAILURE_STATUSES.includes(payment.status)) {
      return {
        order: await this.ordersService.findOwn(userId, order.id),
        payment,
      };
    }

    await this.cleanUpCart(userId, itemIds);
    return { order, payment };
  }

  /**
   * A cart write failure cannot undo a charge already accepted by the
   * gateway, so it must never fail the checkout response. Retrying inline
   * would still block the response on a second flaky write, so a failure
   * here is instead handed to a durable job that keeps retrying until the
   * cart matches the order it was checked out into.
   */
  private async cleanUpCart(userId: string, itemIds?: string[]): Promise<void> {
    try {
      if (itemIds && itemIds.length > 0) {
        await this.cartService.removeItems({ userId }, itemIds);
      } else {
        await this.cartService.clearCart({ userId });
      }
    } catch (error) {
      this.logger.warn(
        `Cart cleanup failed after checkout for user ${userId}; retrying via background job: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.backgroundJobsService.enqueue({
        type: CART_CLEANUP_JOB_TYPE,
        payload: { userId, itemIds: itemIds ?? [] },
      });
    }
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
    idempotencyKey?: string,
  ): Promise<CheckoutResult> {
    const replay = await this.replay(userId, idempotencyKey);
    if (replay) return replay;

    const order = await this.ordersService.createFromOffer(
      userId,
      offerId,
      quantity,
      shippingAddressId,
      currency,
      idempotencyKey,
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

    if (TERMINAL_FAILURE_STATUSES.includes(payment.status)) {
      return {
        order: await this.ordersService.findOwn(userId, order.id),
        payment,
      };
    }

    return { order, payment };
  }

  /**
   * The result of a previous call that used this key, if one reached
   * payment. An order that never got that far (the gateway call threw
   * before a payment existed) frees its key instead, so this checkout
   * proceeds as a fresh attempt rather than being replayed or blocked.
   */
  private async replay(
    userId: string,
    idempotencyKey?: string,
  ): Promise<CheckoutResult | null> {
    if (!idempotencyKey) return null;
    const existing = await this.ordersService.findByIdempotencyKey(
      userId,
      idempotencyKey,
    );
    if (!existing) return null;
    if (!existing.payment) {
      await this.ordersService.releaseIdempotencyKey(existing.id);
      return null;
    }
    const payment = await this.paymentsService.getForOrder(existing.id);
    return { order: existing, payment };
  }
}
