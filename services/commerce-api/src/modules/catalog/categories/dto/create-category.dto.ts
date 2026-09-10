import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

import { IsSlug } from '../../../../common/catalog/slug';

export class CreateCategoryDto {
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
  parentId?: string;
}
