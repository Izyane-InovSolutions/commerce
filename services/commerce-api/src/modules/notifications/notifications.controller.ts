import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';
import type { NotificationPage, NotificationView } from './notifications.types';

/**
 * The signed-in user's own inbox — any role, since sellers are notified
 * about their sales too. Every query is scoped to the caller's user id.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationPage> {
    return this.notifications.list(user.id, query);
  }

  // Declared before ':id/read' only for readability — the two never collide,
  // as they differ in segment count.
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ updated: number }> {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationView> {
    return this.notifications.markRead(user.id, id);
  }
}
