import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../../../common/pagination/pagination-query.dto';

const SORT_PATTERN = /^([a-zA-Z0-9_]+):(asc|desc)$/;

// Duplicates PaginationQueryDto/SortQueryDto's fields rather than composing
// them: TS classes can't extend two base classes, and a mixin would be more
// machinery than two small DTOs warrant.
export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @Matches(SORT_PATTERN, {
    each: true,
    message: 'sort entries must match "field:asc" or "field:desc"',
  })
  sort?: string | string[];

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  categorySlug?: string;

  @IsOptional()
  @IsString()
  brandSlug?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown[] =>
    Array.isArray(value) ? value : [value],
  )
  @IsArray()
  @IsUUID('4', { each: true })
  attributeValueId?: string[];
}
