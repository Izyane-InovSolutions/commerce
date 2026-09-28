import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';

import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export const ADMIN_USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type AdminUserStatus = (typeof ADMIN_USER_STATUSES)[number];

export class ListAdminUsersDto extends PaginationQueryDto {
  /** Matched case-insensitively against email, first and last name. Each
   * whitespace-separated word must match one of them, so "jane doe" finds
   * Jane Doe without a full-name column. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsIn(ADMIN_USER_STATUSES)
  status?: AdminUserStatus;
}
