import { IsIn, IsISO8601, IsOptional } from 'class-validator';

import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
} from '../../../common/catalog/current-price';

export const SALES_INTERVALS = ['day', 'week', 'month'] as const;
export type SalesInterval = (typeof SALES_INTERVALS)[number];

export class SalesAnalyticsQueryDto {
  /** Inclusive; defaults to 30 days before `to`. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Inclusive; defaults to now. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(SALES_INTERVALS)
  interval: SalesInterval = 'day';

  /** Orders are only ever summed within one currency — mixing them would
   * add ngwee to cents. */
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency: string = DEFAULT_CURRENCY;
}
