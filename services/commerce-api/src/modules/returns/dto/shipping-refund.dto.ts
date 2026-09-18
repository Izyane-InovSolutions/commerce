import { IsInt, IsUUID, Min } from 'class-validator';

export class ShippingRefundDto {
  @IsUUID()
  sellerOrderId!: string;

  @IsInt()
  @Min(1)
  amount!: number;
}
