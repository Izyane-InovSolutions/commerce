import {
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
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

  // Which cart lines to check out. Omitted means "the whole cart", which is
  // also what an older client that has never heard of partial checkout sends
  // — so this stays optional rather than becoming a breaking requirement.
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentDetailsDto)
  paymentDetails?: PaymentDetailsDto;
}
