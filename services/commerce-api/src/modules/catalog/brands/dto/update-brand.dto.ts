import { IsOptional, IsString, MinLength } from 'class-validator';

import { IsSlug } from '../../common/slug';

export class UpdateBrandDto {
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
}
