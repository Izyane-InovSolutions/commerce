import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  NotEquals,
} from 'class-validator';

const POSTGRES_INTEGER_MIN = -2_147_483_648;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

export class AdjustStockDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(POSTGRES_INTEGER_MIN)
  @Max(POSTGRES_INTEGER_MAX)
  @NotEquals(0)
  delta!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
