import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto';
import { ReasonActionDto } from './dto/reason-action.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { VersionDto } from './dto/version.dto';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderPage, PurchaseOrderWithLines } from './purchase-orders.types';

@Controller('admin/procurement/purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Roles(Role.STAFF, Role.ADMIN)
  @Get()
  findAll(@Query() query: ListPurchaseOrdersDto): Promise<PurchaseOrderPage> {
    return this.purchaseOrdersService.findAll(query);
  }

  @Roles(Role.STAFF, Role.ADMIN)
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseOrderWithLines> {
    return this.purchaseOrdersService.findById(id);
  }

  @Roles(Role.STAFF, Role.ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrderWithLines> {
    return this.purchaseOrdersService.create(dto, user.id);
  }

  @Roles(Role.STAFF, Role.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderWithLines> {
    return this.purchaseOrdersService.update(id, dto, user.id);
  }

  @Roles(Role.STAFF, Role.ADMIN)
  @Post(':id/submit')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
  ): Promise<PurchaseOrderWithLines> {
    return this.purchaseOrdersService.submit(id, dto.version, user.id);
  }

  @Roles(Role.STAFF, Role.ADMIN)
  @Post(':id/return-to-draft')
  returnToDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonActionDto,
  ): Promise<PurchaseOrderWithLines> {
    return this.purchaseOrdersService.returnToDraft(
      id,
      dto.version,
      dto.reason,
      user.id,
    );
  }

  @Roles(Role.ADMIN)
  @Post(':id/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
  ): Promise<PurchaseOrderWithLines> {
    return this.purchaseOrdersService.approve(id, dto.version, user.id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonActionDto,
  ): Promise<PurchaseOrderWithLines> {
    return this.purchaseOrdersService.reject(
      id,
      dto.version,
      dto.reason,
      user.id,
    );
  }

  @Roles(Role.STAFF, Role.ADMIN)
  @Post(':id/place')
  place(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
  ): Promise<PurchaseOrderWithLines> {
    return this.purchaseOrdersService.place(id, dto.version, user.id);
  }

  @Roles(Role.STAFF, Role.ADMIN)
  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonActionDto,
  ): Promise<PurchaseOrderWithLines> {
    return this.purchaseOrdersService.cancel(
      id,
      dto.version,
      dto.reason,
      user.id,
    );
  }

  @Roles(Role.STAFF, Role.ADMIN)
  @Post(':id/close-short')
  closeShort(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonActionDto,
  ): Promise<PurchaseOrderWithLines> {
    return this.purchaseOrdersService.closeShort(
      id,
      dto.version,
      dto.reason,
      user.id,
    );
  }

  @Roles(Role.STAFF, Role.ADMIN)
  @Post(':id/revise')
  revise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseOrderWithLines> {
    return this.purchaseOrdersService.createRevision(id, user.id);
  }
}
