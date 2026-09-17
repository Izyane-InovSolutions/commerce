import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CustomerShipmentView } from './shipments.types';
import { ShipmentsService } from './shipments.service';

@Controller('orders/:orderId/shipments')
export class CustomerShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get()
  findForOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<CustomerShipmentView[]> {
    return this.shipmentsService.getCustomerShipments(user.id, orderId);
  }
}
