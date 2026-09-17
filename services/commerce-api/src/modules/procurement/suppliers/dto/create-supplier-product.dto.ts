import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSupplierProductDto {
  @IsUUID()
  variantId!: string;

  @IsString()
  @MinLength(1)
  supplierSku!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  packSize?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minimumOrderQty?: number;

  @IsOptional()
  @IsString()
  unitOfMeasure?: string;

  @IsInt()
  @Min(0)
  defaultUnitCost!: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;
}
