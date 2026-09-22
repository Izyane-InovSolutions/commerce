import { IsIn, IsOptional } from 'class-validator';
import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
} from '../../../common/catalog/current-price';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class PublicOfferQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency: string = DEFAULT_CURRENCY;
}
