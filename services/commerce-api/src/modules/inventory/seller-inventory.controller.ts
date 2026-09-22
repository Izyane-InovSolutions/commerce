import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, type InventoryMovement } from '@prisma/client';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import {
  BulkSellerInventoryDto,
  SetSellerInventoryDto,
} from './dto/seller-inventory.dto';
import type { SellerInventoryView } from './inventory.types';
import { SellerInventoryService } from './seller-inventory.service';

@ApiTags('Seller inventory')
@ApiBearerAuth()
@Roles(Role.SELLER)
@Controller('sellers/me/inventory')
export class SellerInventoryController {
  constructor(private readonly inventory: SellerInventoryService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<SellerInventoryView[]> {
    return this.inventory.list(user.id);
  }

  @Put(':offerId')
  set(
    @CurrentUser() user: AuthenticatedUser,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() dto: SetSellerInventoryDto,
  ): Promise<SellerInventoryView> {
    return this.inventory.set(user.id, offerId, dto);
  }

  @Patch('bulk')
  bulk(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkSellerInventoryDto,
  ): Promise<SellerInventoryView[]> {
    return this.inventory.updateMany(user.id, dto.items);
  }

  @Get(':offerId/movements')
  movements(
    @CurrentUser() user: AuthenticatedUser,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ): Promise<InventoryMovement[]> {
    return this.inventory.movements(user.id, offerId);
  }
}
