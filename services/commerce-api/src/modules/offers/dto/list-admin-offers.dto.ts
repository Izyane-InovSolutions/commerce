import { ProductStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class ListAdminOffersDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  /** Every offer on any variant of this product. */
  @IsOptional()
  @IsUUID()
  productId?: string;
}
