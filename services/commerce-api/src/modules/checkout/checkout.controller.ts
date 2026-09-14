import { Body, Controller, Post } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CheckoutService } from './checkout.service';
import { CheckoutResult } from './checkout.types';
import { CreateBuyNowCheckoutDto } from './dto/create-buy-now-checkout.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutDto,
  ): Promise<CheckoutResult> {
    return this.checkoutService.checkout(
      user.id,
      dto.shippingAddressId,
      dto.currency,
      dto.paymentDetails,
    );
  }

  /** "Buy now" — checks one offer out directly, without touching the cart. */
  @Post('buy-now')
  buyNow(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBuyNowCheckoutDto,
  ): Promise<CheckoutResult> {
    return this.checkoutService.checkoutOffer(
      user.id,
      dto.offerId,
      dto.quantity,
      dto.shippingAddressId,
      dto.currency,
      dto.paymentDetails,
    );
  }
}
