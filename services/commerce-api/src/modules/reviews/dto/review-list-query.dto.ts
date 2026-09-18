import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { REVIEW_SORTS } from '../review-sort';
import type { ReviewSort } from '../review-sort';

/**
 * Shared public list query for product reviews and storefront ratings:
 * pagination, an exact-match star filter (rating=1..5 — not a minimum-rating
 * range), and the fixed newest/oldest/highest/lowest sort vocabulary.
 */
export class ReviewListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsIn(REVIEW_SORTS)
  sort?: ReviewSort;
}
