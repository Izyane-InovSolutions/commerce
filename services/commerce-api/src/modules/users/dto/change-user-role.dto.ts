import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

export class ChangeUserRoleDto {
  @IsEnum(Role)
  role!: Role;

  /**
   * The role the caller saw. users has no version column, so the role itself
   * is the compare-and-swap token: a change decided against a stale view is
   * refused with 409 instead of silently overwriting another admin's change.
   */
  @IsEnum(Role)
  expectedRole!: Role;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Matches(/\S/)
  reason?: string;
}
