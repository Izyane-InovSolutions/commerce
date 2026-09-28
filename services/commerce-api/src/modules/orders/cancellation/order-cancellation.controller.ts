import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { OrderWithItems } from '../orders.service';
import { OrderCancellationService } from './order-cancellation.service';

/**
 * Cancelling an unpaid order — PENDING_PAYMENT only; anything later is a
 * 409 (paid orders go through fulfillment cancellations or returns).
 * Retrying on an already-cancelled order returns it unchanged.
 */
@Controller('orders')
export class CustomerOrderCancellationController {
  constructor(private readonly cancellation: OrderCancellationService) {}

  /** Same response shape as `GET /orders/:id`. */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<OrderWithItems> {
    return this.cancellation.cancelOwn(
      { userId: user.id, kind: 'customer', ipAddress: ip, userAgent },
      id,
    );
  }
}

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/orders')
export class AdminOrderCancellationController {
  constructor(private readonly cancellation: OrderCancellationService) {}

  /** Same response shape as `GET /admin/orders/:id`. */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<OrderWithItems> {
    return this.cancellation.cancelAny(
      { userId: user.id, kind: 'staff', ipAddress: ip, userAgent },
      id,
    );
  }
}
