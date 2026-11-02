import { Injectable, Logger } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';

import { CartService } from '../cart/cart.service';
import { OrdersService } from '../orders/orders.service';
import type {
  CheckoutAttemptFence,
  OrderWithItems,
} from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import type { PaymentWithRedirect } from '../payments/payments.service';
import type { PaymentDetailsDto } from '../payments/dto/payment-details.dto';
import {
  CheckoutAttemptSupersededError,
  isDefiniteCheckoutFailure,
} from './checkout-attempt.errors';
import { CheckoutAttemptsService } from './checkout-attempts.service';
import {
  normalizeBuyNowCheckout,
  normalizeCartCheckout,
} from './checkout-fingerprint';
import {
  CheckoutAttemptContext,
  CheckoutIdempotencyKey,
  CheckoutQuote,
  CheckoutResult,
} from './checkout.types';

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
    private readonly attempts: CheckoutAttemptsService,
  ) {}

  /**
   * `itemIds`, when given, checks out only those cart lines and leaves the
   * rest of the cart alone — a shopper can pay for part of what they picked
   * without losing track of the rest. Omitted, it is every line in the cart,
   * same as before partial checkout existed.
   *
   * `idempotencyKey`, when given, makes a retried call — a double submit, or
   * a retry after a timeout — return the outcome that call already recorded
   * instead of checking out a second time (see CheckoutAttemptsService).
   * Without one, every call is a new checkout.
   */
  async checkout(
    userId: string,
    shippingAddressId: string,
    currency: string,
    paymentDetails?: PaymentDetailsDto,
    itemIds?: string[],
    idempotencyKey?: CheckoutIdempotencyKey,
  ): Promise<CheckoutResult> {
    const request = normalizeCartCheckout({
      shippingAddressId,
      currency,
      itemIds,
      paymentDetails,
    });
    // The order is built from the normalized request, not the raw one, so
    // two requests that fingerprint alike can never execute differently (and
    // a replayed rejection is always the one the retry itself would get).
    return this.attempts.run(userId, idempotencyKey, request, (context) =>
      this.execute(userId, context, paymentDetails, true, (fence) =>
        this.ordersService.createFromCart(
          userId,
          request.shippingAddressId,
          request.currency,
          request.itemIds ?? undefined,
          idempotencyKey?.key,
          fence,
        ),
      ),
    );
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
    idempotencyKey?: CheckoutIdempotencyKey,
  ): Promise<CheckoutResult> {
    const request = normalizeBuyNowCheckout({
      offerId,
      quantity,
      shippingAddressId,
      currency,
      paymentDetails,
    });
    return this.attempts.run(userId, idempotencyKey, request, (context) =>
      this.execute(userId, context, paymentDetails, false, (fence) =>
        this.ordersService.createFromOffer(
          userId,
          request.offerId,
          request.quantity,
          request.shippingAddressId,
          request.currency,
          idempotencyKey?.key,
          fence,
        ),
      ),
    );
  }

  /** The cost breakdown a cart checkout would charge right now — no order is created. */
  quote(
    userId: string,
    shippingAddressId: string,
    currency: string,
    itemIds?: string[],
  ): Promise<CheckoutQuote> {
    return this.ordersService.quoteFromCart(
      userId,
      shippingAddressId,
      currency,
      itemIds,
    );
  }

  /** The cost breakdown a "buy now" checkout would charge right now. */
  quoteOffer(
    userId: string,
    offerId: string,
    quantity: number,
    shippingAddressId: string,
    currency: string,
  ): Promise<CheckoutQuote> {
    return this.ordersService.quoteFromOffer(
      userId,
      offerId,
      quantity,
      shippingAddressId,
      currency,
    );
  }

  /**
   * Shared by both checkouts. `context` is null for a keyless request; for a
   * keyed one it carries the attempt this request owns, and possibly an
   * order an interrupted earlier owner created that never reached payment.
   */
  private async execute(
    userId: string,
    context: CheckoutAttemptContext | null,
    paymentDetails: PaymentDetailsDto | undefined,
    cartCheckout: boolean,
    createOrder: (fence?: CheckoutAttemptFence) => Promise<OrderWithItems>,
  ): Promise<CheckoutResult> {
    const order = context?.resumeOrderId
      ? await this.ordersService.findForCheckout(context.resumeOrderId)
      : await createOrder(
          context
            ? { id: context.attemptId, ownerToken: context.ownerToken }
            : undefined,
        );

    let payment: PaymentWithRedirect;
    try {
      // Fenced inside the Payment insert's own transaction: a request that
      // lost its attempt creates no payment and reaches no provider.
      payment = await this.paymentsService.initializeForOrder(
        order,
        paymentDetails,
        context
          ? (tx): Promise<void> =>
              this.attempts.markPaymentStarted(context, order.id, tx)
          : undefined,
      );
    } catch (error) {
      // The order belongs to whichever request now owns the attempt.
      if (error instanceof CheckoutAttemptSupersededError) throw error;
      // Cart is left untouched here so the customer can retry checkout.
      await this.cancelAfterPaymentError(order.id, error, context !== null);
      throw error;
    }

    // A gateway that settles inline can come back already declined; the
    // order is already cancelled by then (see PaymentsService.applyEvent),
    // so the cart must be preserved, not cleared, and the caller needs the
    // cancelled order rather than the stale pending one it was created as.
    const declined = TERMINAL_FAILURE_STATUSES.includes(payment.status);
    const result: CheckoutResult = declined
      ? { order: await this.ordersService.findOwn(userId, order.id), payment }
      : { order, payment };

    // Recorded before cart cleanup: a replay must never depend on it.
    if (context) await this.attempts.complete(context, order.id, result);
    if (cartCheckout && !declined) await this.cleanUpCart(userId, order.id);
    return result;
  }

  /**
   * Releases the order's stock only when no charge can follow: the payment
   * row is FAILED/CANCELLED, or there is none and either the error is a
   * definite refusal or there is no keyed attempt that could resume the
   * order. Anything else (a pending payment, or a transient error a retry of
   * the same key will resume) keeps the order and its reservations.
   */
  private async cancelAfterPaymentError(
    orderId: string,
    error: unknown,
    keyed: boolean,
  ): Promise<void> {
    try {
      const payment = await this.paymentsService.findForOrder(orderId);
      const definiteFailure = payment
        ? TERMINAL_FAILURE_STATUSES.includes(payment.status)
        : isDefiniteCheckoutFailure(error) || !keyed;
      if (definiteFailure) await this.ordersService.cancel(orderId);
    } catch (cancelError) {
      // Never mask the payment error; the reservations still expire.
      this.logger.error(
        `Could not cancel order ${orderId} after its payment failed to start`,
        cancelError instanceof Error ? cancelError.stack : String(cancelError),
      );
    }
  }

  /**
   * A cart write failure cannot undo a charge already accepted by the
   * gateway, so it must never fail the checkout response. The order
   * transaction already enqueued a durable cleanup job for this order, which
   * keeps retrying until the cart matches what was checked out.
   */
  private async cleanUpCart(userId: string, orderId: string): Promise<void> {
    try {
      await this.cartService.cleanUpCheckout(userId, orderId);
    } catch (error) {
      this.logger.warn(
        `Cart cleanup for order ${orderId} deferred to its background job: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
