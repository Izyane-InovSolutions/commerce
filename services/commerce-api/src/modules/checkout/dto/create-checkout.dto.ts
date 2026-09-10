import { IsUUID } from 'class-validator';

export class CreateCheckoutDto {
  @IsUUID()
  shippingAddressId!: string;
}
