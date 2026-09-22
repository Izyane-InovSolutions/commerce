import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { OrdersService, OrderWithItems } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<OrderWithItems[]> {
    return this.ordersService.listOwn(user.id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderWithItems> {
    return this.ordersService.findOwn(user.id, id);
  }
}
