import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ReceiveStockDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
