import { Body, Controller, Post } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CheckoutService } from './checkout.service';
import { CheckoutResult } from './checkout.types';
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
      dto.paymentDetails,
    );
  }
}
