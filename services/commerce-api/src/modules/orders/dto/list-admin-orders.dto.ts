import { OrderStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class ListAdminOrdersDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
