import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../../common/auth/roles.decorator';
import type { AdminOrderDetail } from './admin-order-detail';
import { ListAdminOrdersDto } from './dto/list-admin-orders.dto';
import { OrderPage, OrdersService } from './orders.service';

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@Query() query: ListAdminOrdersDto): Promise<OrderPage> {
    return this.ordersService.listAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AdminOrderDetail> {
    return this.ordersService.findAny(id);
  }
}
