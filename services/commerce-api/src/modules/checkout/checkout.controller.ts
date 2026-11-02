import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';
import { isUUID } from 'class-validator';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CheckoutService } from './checkout.service';
import {
  CheckoutIdempotencyKey,
  CheckoutQuote,
  CheckoutResult,
} from './checkout.types';
import { CreateBuyNowCheckoutDto } from './dto/create-buy-now-checkout.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

/**
 * Absent is fine — a caller that sends none simply gets no retry protection,
 * so a timed-out or double-submitted request can check out twice. Present, it
 * must be a UUID v4; letter case is ignored, so the same key in either case
 * names the same checkout.
 */
function idempotencyKey(
  key: string | undefined,
): CheckoutIdempotencyKey | undefined {
  if (key === undefined) return undefined;
  if (!isUUID(key, '4'))
    throw new BadRequestException('Idempotency-Key must be a UUID v4');
  return { key: key.toLowerCase(), rawKey: key };
}

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  /**
   * Optional `Idempotency-Key` (UUID v4): a retry with the same key and the
   * same request returns the recorded result instead of checking out again;
   * reusing it for a different request, or retrying while the first call is
   * still running or its payment awaits reconciliation, answers 409 with a
   * `code` detail (see checkout-attempt.errors.ts).
   */
  @Post()
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<CheckoutResult> {
    return this.checkoutService.checkout(
      user.id,
      dto.shippingAddressId,
      dto.currency,
      dto.paymentDetails,
      dto.itemIds,
      idempotencyKey(key),
    );
  }

  /**
   * "Buy now" — checks one offer out directly, without touching the cart.
   * `Idempotency-Key` works as on POST /checkout.
   */
  @Post('buy-now')
  buyNow(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBuyNowCheckoutDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<CheckoutResult> {
    return this.checkoutService.checkoutOffer(
      user.id,
      dto.offerId,
      dto.quantity,
      dto.shippingAddressId,
      dto.currency,
      dto.paymentDetails,
      idempotencyKey(key),
    );
  }

  /**
   * The cost breakdown — subtotal, shipping, total — a cart checkout would
   * charge right now, without creating an order. Lets the checkout page show
   * shipping before the shopper pays, once they have picked an address.
   */
  @Post('quote')
  quote(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutDto,
  ): Promise<CheckoutQuote> {
    return this.checkoutService.quote(
      user.id,
      dto.shippingAddressId,
      dto.currency,
      dto.itemIds,
    );
  }

  /** The same preview, for a "buy now" checkout. */
  @Post('buy-now/quote')
  buyNowQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBuyNowCheckoutDto,
  ): Promise<CheckoutQuote> {
    return this.checkoutService.quoteOffer(
      user.id,
      dto.offerId,
      dto.quantity,
      dto.shippingAddressId,
      dto.currency,
    );
  }
}
