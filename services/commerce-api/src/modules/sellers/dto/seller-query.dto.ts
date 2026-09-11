import { IsEnum, IsOptional } from 'class-validator';
import { SellerStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class SellerQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SellerStatus)
  status?: SellerStatus;
}
