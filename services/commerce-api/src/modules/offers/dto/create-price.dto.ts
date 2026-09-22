import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, Min } from 'class-validator';

import { SUPPORTED_CURRENCIES } from '../../../common/catalog/current-price';

export class CreatePriceDto {
  @IsInt()
  @Min(0)
  amount!: number;

  // Constrained to what the platform prices in: a price in any other
  // currency would be stored and then never resolve for anyone, because
  // nothing browses or settles in it.
  @IsIn(SUPPORTED_CURRENCIES)
  currency!: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;
}
