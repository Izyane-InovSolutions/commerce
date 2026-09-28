import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
} from '../../../common/catalog/current-price';
import { MAX_PAGE_SIZE } from '../../../common/pagination/pagination-query.dto';

export class DealsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = 24;

  /** Which currency's sale prices count, as on the product listing. */
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency: string = DEFAULT_CURRENCY;
}
