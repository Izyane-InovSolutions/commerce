import { IsUUID, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentDetailsDto } from '../../payments/dto/payment-details.dto';

export class CreateCheckoutDto {
  @IsUUID()
  shippingAddressId!: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentDetailsDto)
  paymentDetails?: PaymentDetailsDto;
}
