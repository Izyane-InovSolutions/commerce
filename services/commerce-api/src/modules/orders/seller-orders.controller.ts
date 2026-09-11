import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import {
  SellerOrderPage,
  SellerOrdersService,
  SellerOrderWithItems,
} from './seller-orders.service';

@Controller('sellers/me/orders')
export class SellerOrdersController {
  constructor(private readonly sellerOrdersService: SellerOrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<SellerOrderPage<SellerOrderWithItems>> {
    return this.sellerOrdersService.listOwn(user.id, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SellerOrderWithItems> {
    return this.sellerOrdersService.findOwn(user.id, id);
  }
}
