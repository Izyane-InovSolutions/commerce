import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ReviewModerationState, ReviewVisibility } from '@prisma/client';

import { PaginationQueryDto } from '../../../../common/pagination/pagination-query.dto';
import { booleanQuery } from '../../../../common/pagination/boolean-query.transform';

/** URL-facing discriminator for which underlying table a row/route targets —
 * kept as short lowercase segments ('product'/'seller') rather than the
 * Prisma ReviewTargetType enum values, to match this codebase's other
 * human-friendly path segments (e.g. admin/returns, admin/sellers). */
export enum AdminReviewType {
  PRODUCT = 'product',
  SELLER = 'seller',
}

export class ListAdminReviewsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AdminReviewType)
  type?: AdminReviewType;

  @IsOptional()
  @IsEnum(ReviewModerationState)
  moderationState?: ReviewModerationState;

  @IsOptional()
  @IsEnum(ReviewVisibility)
  visibility?: ReviewVisibility;

  /** true = only rows with at least one OPEN report; false = only rows with
   * none; omitted = no filtering on report status. */
  @IsOptional()
  @Transform(booleanQuery)
  @IsBoolean()
  hasOpenReport?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @IsOptional()
  @IsDateString()
  updatedFrom?: string;

  @IsOptional()
  @IsDateString()
  updatedTo?: string;
}
