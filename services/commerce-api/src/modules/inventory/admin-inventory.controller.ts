import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  Query,
  Body,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { Role, type InventoryMovement, type Reservation } from '@prisma/client';
import { isUUID } from 'class-validator';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { InventoryService } from './inventory.service';
import { InventoryRecordView } from './inventory.types';
import { UpdateReorderPointDto } from './dto/update-reorder-point.dto';

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/inventory')
export class AdminInventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  findAll(
    @Query('warehouseId') warehouseId?: string,
    @Query('variantId') variantId?: string,
  ): Promise<InventoryRecordView[]> {
    return this.inventoryService.listRecords({ warehouseId, variantId });
  }

  @Post('receive')
  receive(@Body() dto: ReceiveStockDto): Promise<InventoryRecordView> {
    return this.inventoryService.receiveStock(
      dto.warehouseId,
      dto.variantId,
      dto.quantity,
      dto.note,
    );
  }

  @Post('adjust')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Optional UUID v4 used to replay a completed adjustment safely',
  })
  adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AdjustStockDto,
    @Headers('idempotency-key') key: string | undefined,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<InventoryRecordView> {
    if (key !== undefined && !isUUID(key, '4')) {
      throw new BadRequestException('Idempotency-Key must be a UUID v4');
    }
    return this.inventoryService.adjustStock(
      dto.warehouseId,
      dto.variantId,
      dto.delta,
      dto.note,
      {
        actorUserId: user.id,
        idempotencyKey: key,
        ipAddress,
        userAgent,
      },
    );
  }

  @Get(':id/movements')
  movements(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InventoryMovement[]> {
    return this.inventoryService.listMovements(id);
  }

  @Patch(':id/reorder-point')
  updateReorderPoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReorderPointDto,
  ): Promise<InventoryRecordView> {
    return this.inventoryService.updateReorderPoint(id, dto.reorderPoint);
  }

  @Get(':id/reservations')
  reservations(@Param('id', ParseUUIDPipe) id: string): Promise<Reservation[]> {
    return this.inventoryService.listReservations(id);
  }
}
