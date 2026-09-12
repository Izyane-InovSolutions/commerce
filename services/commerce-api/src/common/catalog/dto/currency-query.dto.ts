import { IsIn, IsOptional } from 'class-validator';

import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '../current-price';

/**
 * The currency a shopper is browsing and buying in.
 *
 * A query parameter rather than a header so it is part of the URL: clients
 * cache catalog responses by URL, and two shoppers in different currencies
 * must not share one cached page.
 */
export class CurrencyQueryDto {
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency: string = DEFAULT_CURRENCY;
}
