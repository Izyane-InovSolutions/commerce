import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class ListAuditEventsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  action?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  targetType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  targetId?: string;

  /** Inclusive lower bound on createdAt. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Inclusive upper bound on createdAt. */
  @IsOptional()
  @IsISO8601()
  to?: string;
}
