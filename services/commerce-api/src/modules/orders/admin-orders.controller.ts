import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';

import { Roles } from '../../common/auth/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { OrderPage, OrdersService, OrderWithItems } from './orders.service';

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: OrderStatus,
  ): Promise<OrderPage> {
    return this.ordersService.listAll({ ...query, status });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<OrderWithItems> {
    return this.ordersService.findAny(id);
  }
}
