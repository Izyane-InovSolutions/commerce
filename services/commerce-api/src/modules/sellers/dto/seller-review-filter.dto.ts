import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ReviewModerationState, ReviewVisibility } from '@prisma/client';

import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

// Parallels ListReturnsDto's filter shape (status/date range) for the seller
// reviews/ratings reads: rating, visibility, moderation state, an aggregate
// "has an open report" flag (never the reports themselves), and a date range
// over createdAt.
export class SellerReviewFilterDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsEnum(ReviewVisibility)
  visibility?: ReviewVisibility;

  @IsOptional()
  @IsEnum(ReviewModerationState)
  moderationState?: ReviewModerationState;

  /** true = only rows with an open report; false = only rows with none. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  reported?: boolean;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
