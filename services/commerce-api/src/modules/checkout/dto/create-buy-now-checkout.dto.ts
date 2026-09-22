import {
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
} from '../../../common/catalog/current-price';
import { PaymentDetailsDto } from '../../payments/dto/payment-details.dto';

/** Checks one offer out directly, at its own quantity, leaving the persisted cart alone. */
export class CreateBuyNowCheckoutDto {
  @IsUUID()
  offerId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity: number = 1;

  @IsUUID()
  shippingAddressId!: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency: string = DEFAULT_CURRENCY;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentDetailsDto)
  paymentDetails?: PaymentDetailsDto;
}
