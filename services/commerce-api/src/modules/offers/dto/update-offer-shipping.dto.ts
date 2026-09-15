import { IsIn, IsInt, Min, ValidateIf } from 'class-validator';

import { SUPPORTED_CURRENCIES } from '../../../common/catalog/current-price';

/**
 * A flat, informational shipping cost shown on the catalog — separate from
 * the dynamic per-destination quote `ShippingService` computes at checkout.
 *
 * `amount: null` clears it (nothing is shown); a number requires `currency`
 * alongside it.
 */
export class UpdateOfferShippingDto {
  @ValidateIf((dto: UpdateOfferShippingDto) => dto.amount !== null)
  @IsInt()
  @Min(0)
  amount!: number | null;

  @ValidateIf((dto: UpdateOfferShippingDto) => dto.amount !== null)
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: string;
}
