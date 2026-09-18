import { FulfillmentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class ListFulfillmentsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(FulfillmentStatus)
  status?: FulfillmentStatus;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;
}
