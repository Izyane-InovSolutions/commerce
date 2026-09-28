import {
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * What a seller may change on their own submission. Deliberately narrower
 * than the admin UpdateProductDto: the slug is the product's public URL, and
 * returnability is a platform policy decision, so both stay admin-only.
 */
export class SellerUpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

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
}
