import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PurchaseOrderStatus } from '@prisma/client';

import { PaginationQueryDto } from '../../../../common/pagination/pagination-query.dto';

export class ListPurchaseOrdersDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  /** POs with an expectedDeliveryDate in the past that are still open. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overdue?: boolean;

  /** POs sitting in SUBMITTED, waiting on an approver. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  awaitingApproval?: boolean;
}
