import { IsIn, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
} from '../../../common/catalog/current-price';
import { PaymentDetailsDto } from '../../payments/dto/payment-details.dto';

export class CreateCheckoutDto {
  @IsUUID()
  shippingAddressId!: string;

  // The currency the cart was priced in when the shopper agreed to the total.
  // Sent explicitly so the order cannot be built at a different one than the
  // page they confirmed.
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency: string = DEFAULT_CURRENCY;
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentDetailsDto)
  paymentDetails?: PaymentDetailsDto;
}
