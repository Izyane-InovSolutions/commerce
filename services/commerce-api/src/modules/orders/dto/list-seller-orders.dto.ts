import { FulfillmentStatus, OfferFulfillmentMode, OrderStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class ListSellerOrdersDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(FulfillmentStatus)
  fulfillmentStatus?: FulfillmentStatus;

  // Matches a SellerOrder that has at least one ShippingGroup of this mode -
  // a seller order can be mixed (some groups SELLER, some PLATFORM), so this
  // is "contains", not "is exclusively."
  @IsOptional()
  @IsEnum(OfferFulfillmentMode)
  fulfillmentMode?: OfferFulfillmentMode;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
