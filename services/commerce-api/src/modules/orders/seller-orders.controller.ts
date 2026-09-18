import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ListSellerOrdersDto } from './dto/list-seller-orders.dto';
import { SellerOrdersService } from './seller-orders.service';
import {
  SellerOrderDetail,
  SellerOrderListItem,
  SellerOrderPage,
} from './seller-orders.types';

@Controller('sellers/me/orders')
export class SellerOrdersController {
  constructor(private readonly sellerOrdersService: SellerOrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSellerOrdersDto,
  ): Promise<SellerOrderPage<SellerOrderListItem>> {
    return this.sellerOrdersService.listOwn(user.id, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SellerOrderDetail> {
    return this.sellerOrdersService.findOwn(user.id, id);
  }
}
