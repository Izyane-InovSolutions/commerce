import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Role, type TrackingEvent } from '@prisma/client';
import { isUUID } from 'class-validator';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AddTrackingEventDto } from './dto/add-tracking-event.dto';
import { CancelShipmentDto } from './dto/cancel-shipment.dto';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { ListShipmentsDto } from './dto/list-shipments.dto';
import { ShipmentPage, ShipmentWithLines } from './shipments.types';
import { ShipmentsService } from './shipments.service';

function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !isUUID(key, '4')) {
    throw new BadRequestException('Idempotency-Key header must be a UUID v4');
  }
  return key;
}

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/shipments')
export class AdminShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get()
  findAll(@Query() query: ListShipmentsDto): Promise<ShipmentPage> {
    return this.shipmentsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ShipmentWithLines> {
    return this.shipmentsService.findById(id);
  }

  @Get(':id/tracking-events')
  listTrackingEvents(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TrackingEvent[]> {
    return this.shipmentsService.listTrackingEvents(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateShipmentDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<ShipmentWithLines> {
    return this.shipmentsService.create(dto, user.id, requireIdempotencyKey(key));
  }

  @Post(':id/book')
  book(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShipmentWithLines> {
    return this.shipmentsService.book(id, user.id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelShipmentDto,
  ): Promise<ShipmentWithLines> {
    return this.shipmentsService.cancel(id, dto.reason, user.id);
  }

  @Post(':id/tracking-events')
  addTrackingEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTrackingEventDto,
  ): Promise<TrackingEvent> {
    return this.shipmentsService.addManualTrackingEvent(id, dto, user.id, user.role);
  }
}
