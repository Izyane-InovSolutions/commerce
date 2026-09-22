import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  NotEquals,
} from 'class-validator';

export class AdjustStockDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  variantId!: string;

  @IsInt()
  @NotEquals(0)
  delta!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
