import { IsUUID } from 'class-validator';

export class CreateOfferDto {
  @IsUUID()
  variantId!: string;
}
