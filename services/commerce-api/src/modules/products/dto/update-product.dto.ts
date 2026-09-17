import {
  IsOptional,
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  MinLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { IsSlug } from '../../../common/catalog/slug';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @IsSlug()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsUUID()
  brandId?: string | null;

  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsBoolean()
  isReturnable?: boolean;

  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsInt()
  @Min(0)
  returnWindowDays?: number | null;
}
