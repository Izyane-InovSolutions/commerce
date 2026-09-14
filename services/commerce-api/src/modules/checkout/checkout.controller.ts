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
import { CheckoutResult } from './checkout.types';
import { CreateBuyNowCheckoutDto } from './dto/create-buy-now-checkout.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

/** Absent is fine — a caller that sends none simply gets no retry dedup. */
function idempotencyKey(key: string | undefined): string | undefined {
  if (key === undefined) return undefined;
  if (!isUUID(key, '4'))
    throw new BadRequestException('Idempotency-Key must be a UUID v4');
  return key;
}

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

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

  /** "Buy now" — checks one offer out directly, without touching the cart. */
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
}
