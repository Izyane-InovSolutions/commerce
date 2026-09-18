import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { isUUID } from 'class-validator';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CancelLinesDto } from './dto/cancel-lines.dto';
import { RecordQuantitiesDto } from './dto/record-quantities.dto';
import { RejectFulfillmentDto } from './dto/reject-fulfillment.dto';
import { SellerDispatchDto } from './dto/seller-dispatch.dto';
import { VersionDto } from './dto/version.dto';
import {
  FulfillmentsService,
  SellerFulfillmentOrderWithShipments,
} from './fulfillments.service';
import { FulfillmentOrderWithDetail } from './fulfillment.types';

/** Required — reject/pack/cancel/dispatch commands must be safely
 * retryable, same convention as AdminFulfillmentsController. */
function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !isUUID(key, '4')) {
    throw new BadRequestException('Idempotency-Key header must be a UUID v4');
  }
  return key;
}

/** No @Roles decorator — a seller-only, own-resource surface gated entirely
 * inside FulfillmentsService via SellersService.lockApproved plus the
 * cross-tenant 404 ownership check, mirroring SellerOrdersController. */
@Controller('sellers/me/fulfillments')
export class SellerFulfillmentsController {
  constructor(private readonly fulfillmentsService: FulfillmentsService) {}

  @Post(':id/accept')
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.acceptSellerFulfillment(id, user.id, dto.version);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectFulfillmentDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.rejectSellerFulfillment(
      id,
      user.id,
      dto.version,
      dto.reason,
      user.id,
      requireIdempotencyKey(key),
    );
  }

  @Post(':id/packs')
  pack(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordQuantitiesDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.recordSellerPack(
      id,
      user.id,
      dto.lines,
      user.id,
      requireIdempotencyKey(key),
    );
  }

  @Post(':id/cancellations')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelLinesDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.cancelSellerFulfillment(
      id,
      user.id,
      dto.lines,
      dto.reason,
      user.id,
      requireIdempotencyKey(key),
    );
  }

  @Post(':id/dispatches')
  dispatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SellerDispatchDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<SellerFulfillmentOrderWithShipments> {
    return this.fulfillmentsService.dispatchSellerFulfillment(
      id,
      user.id,
      {
        lines: dto.lines,
        carrierCode: dto.carrierCode,
        trackingReference: dto.trackingReference,
        estimatedDeliveryAt: dto.estimatedDeliveryAt
          ? new Date(dto.estimatedDeliveryAt)
          : undefined,
      },
      user.id,
      requireIdempotencyKey(key),
    );
  }
}
