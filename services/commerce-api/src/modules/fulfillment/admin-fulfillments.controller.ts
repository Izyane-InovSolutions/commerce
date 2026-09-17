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
import { FulfillmentWorkItemType, Prisma, Role } from '@prisma/client';
import { isUUID } from 'class-validator';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AssignWorkItemDto } from './dto/assign-work-item.dto';
import { CancelLinesDto } from './dto/cancel-lines.dto';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { DispatchDto } from './dto/dispatch.dto';
import { ListFulfillmentsDto } from './dto/list-fulfillments.dto';
import { RecordQuantitiesDto } from './dto/record-quantities.dto';
import { ResolveExceptionDto } from './dto/resolve-exception.dto';
import { VersionDto } from './dto/version.dto';
import {
  FulfillmentDispatchWithLines,
  FulfillmentOrderPage,
  FulfillmentOrderWithDetail,
} from './fulfillment.types';
import { FulfillmentsService } from './fulfillments.service';

function parseWorkItemType(value: string): FulfillmentWorkItemType {
  const upper = value.toUpperCase();
  if (upper !== FulfillmentWorkItemType.PICK && upper !== FulfillmentWorkItemType.PACK) {
    throw new BadRequestException('type must be "pick" or "pack"');
  }
  return upper as FulfillmentWorkItemType;
}

/** Required — pick/pack/dispatch/cancel commands must be safely retryable. */
function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !isUUID(key, '4')) {
    throw new BadRequestException('Idempotency-Key header must be a UUID v4');
  }
  return key;
}

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/fulfillments')
export class AdminFulfillmentsController {
  constructor(private readonly fulfillmentsService: FulfillmentsService) {}

  @Get()
  findAll(@Query() query: ListFulfillmentsDto): Promise<FulfillmentOrderPage> {
    return this.fulfillmentsService.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.findById(id);
  }

  @Get(':id/events')
  listEvents(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Prisma.FulfillmentEventGetPayload<object>[]> {
    return this.fulfillmentsService.listEvents(id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/work-items/:type/assign')
  assignWorkItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type') type: string,
    @Body() dto: AssignWorkItemDto,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.assignWorkItem(
      id,
      parseWorkItemType(type),
      dto.assigneeUserId,
      dto.version,
      user.id,
    );
  }

  @Post(':id/picking/start')
  startPicking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.startWork(
      id,
      FulfillmentWorkItemType.PICK,
      dto.version,
      user.id,
      user.role,
    );
  }

  @Post(':id/picks')
  recordPicks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordQuantitiesDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.recordQuantities(
      id,
      FulfillmentWorkItemType.PICK,
      dto.lines,
      user.id,
      user.role,
      requireIdempotencyKey(key),
    );
  }

  @Post(':id/picking/complete')
  completePicking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.completeWork(
      id,
      FulfillmentWorkItemType.PICK,
      dto.version,
      user.id,
      user.role,
    );
  }

  @Post(':id/packing/start')
  startPacking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.startWork(
      id,
      FulfillmentWorkItemType.PACK,
      dto.version,
      user.id,
      user.role,
    );
  }

  @Post(':id/packs')
  recordPacks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordQuantitiesDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.recordQuantities(
      id,
      FulfillmentWorkItemType.PACK,
      dto.lines,
      user.id,
      user.role,
      requireIdempotencyKey(key),
    );
  }

  @Post(':id/packing/complete')
  completePacking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.completeWork(
      id,
      FulfillmentWorkItemType.PACK,
      dto.version,
      user.id,
      user.role,
    );
  }

  @Post(':id/exceptions')
  createException(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateExceptionDto,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.createException(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/exceptions/:exceptionId/resolve')
  resolveException(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('exceptionId', ParseUUIDPipe) exceptionId: string,
    @Body() dto: ResolveExceptionDto,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.resolveException(id, exceptionId, dto, user.id);
  }

  @Post(':id/dispatches')
  dispatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DispatchDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<FulfillmentDispatchWithLines> {
    return this.fulfillmentsService.dispatch(
      id,
      dto.shipmentId,
      user.id,
      requireIdempotencyKey(key),
    );
  }

  @Roles(Role.ADMIN)
  @Post(':id/cancellations')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelLinesDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.fulfillmentsService.cancel(id, dto, user.id, requireIdempotencyKey(key));
  }
}
