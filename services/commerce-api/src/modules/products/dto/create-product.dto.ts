import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

import { IsSlug } from '../../../common/catalog/slug';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @IsSlug()
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
