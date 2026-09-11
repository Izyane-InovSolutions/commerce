import { IsUUID } from 'class-validator';

import { PaymentDetailsDto } from './payment-details.dto';

export class CreateCheckoutDto extends PaymentDetailsDto {
  @IsUUID()
  shippingAddressId!: string;
}
