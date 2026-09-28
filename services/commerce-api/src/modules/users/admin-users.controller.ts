import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AdminUserDetail, AdminUserPage } from './admin-user';
import { AdminUsersService } from './admin-users.service';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';

/**
 * User and role administration — ADMIN only (not STAFF), since every write
 * here changes who can reach the admin surface itself.
 * Refusals (self-changes, the last admin, seller-owner rules, stale reads)
 * come back as 403/409 with a message meant to be shown as-is.
 */
@ApiTags('Admin users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAdminUsersDto,
  ): Promise<AdminUserPage> {
    return this.users.list(user.id, query);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminUserDetail> {
    return this.users.detail(user.id, id);
  }

  /** Revokes the user's sessions, so the new role applies from their next
   * sign-in rather than whenever their access token happens to expire. */
  @Patch(':id/role')
  changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeUserRoleDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AdminUserDetail> {
    return this.users.changeRole(
      { userId: user.id, ipAddress: ip, userAgent },
      id,
      dto,
    );
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserStatusDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AdminUserDetail> {
    return this.users.setActive(
      { userId: user.id, ipAddress: ip, userAgent },
      id,
      false,
      dto,
    );
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  enable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserStatusDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AdminUserDetail> {
    return this.users.setActive(
      { userId: user.id, ipAddress: ip, userAgent },
      id,
      true,
      dto,
    );
  }
}
