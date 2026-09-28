import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
} from '../../../common/catalog/current-price';
import { MAX_PAGE_SIZE } from '../../../common/pagination/pagination-query.dto';

export const DEFAULT_BEST_SELLER_LIMIT = 24;
export const DEFAULT_BEST_SELLER_DAYS = 30;

export class BestSellersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_BEST_SELLER_LIMIT;

  /** How far back sales are counted, in days. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days: number = DEFAULT_BEST_SELLER_DAYS;

  /** Same meaning as on the product listing: which currency prices resolve in. */
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency: string = DEFAULT_CURRENCY;
}
