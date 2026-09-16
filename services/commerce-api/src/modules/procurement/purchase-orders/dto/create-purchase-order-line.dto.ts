import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePurchaseOrderLineDto {
  @IsUUID()
  variantId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  supplierSku?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  packSize?: number;

  @IsInt()
  @Min(1)
  orderedQuantity!: number;

  @IsInt()
  @Min(0)
  unitCostAmount!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  taxRateBasisPoints?: number;
}
