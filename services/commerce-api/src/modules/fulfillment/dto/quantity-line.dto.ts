import { IsInt, IsUUID, Min } from 'class-validator';

export class QuantityLineDto {
  @IsUUID()
  fulfillmentLineId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
