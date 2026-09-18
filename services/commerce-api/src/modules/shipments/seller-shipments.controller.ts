import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Shipment } from '@prisma/client';
import { isUUID } from 'class-validator';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { SellerTrackingEventDto } from './dto/seller-tracking-event.dto';
import { ShipmentsService } from './shipments.service';

/** Required — a seller-submitted tracking event must be safely retryable. */
function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !isUUID(key, '4')) {
    throw new BadRequestException('Idempotency-Key header must be a UUID v4');
  }
  return key;
}

/** No @Roles decorator — gating is entirely inside ShipmentsService via
 * SellersService.lockApproved plus the cross-tenant 404 ownership check,
 * mirroring SellerOrdersController/SellerFulfillmentsController. */
@Controller('sellers/me/shipments')
export class SellerShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post(':id/tracking-events')
  addTrackingEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SellerTrackingEventDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<Shipment> {
    return this.shipmentsService.addSellerTrackingEvent(
      id,
      user.id,
      {
        normalizedStatus: dto.normalizedStatus,
        description: dto.description,
        location: dto.location,
        occurredAt: new Date(dto.occurredAt),
      },
      user.id,
      requireIdempotencyKey(key),
    );
  }
}
