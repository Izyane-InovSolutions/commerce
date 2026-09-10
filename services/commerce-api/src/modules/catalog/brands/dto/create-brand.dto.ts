import { IsOptional, IsString, MinLength } from 'class-validator';

import { IsSlug } from '../../common/slug';

export class CreateBrandDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @IsSlug()
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
