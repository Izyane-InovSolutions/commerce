import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { isUUID } from 'class-validator';

import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { ReverseGoodsReceiptDto } from './dto/reverse-goods-receipt.dto';
import { GoodsReceiptsService } from './goods-receipts.service';
import { GoodsReceiptWithLines } from './goods-receipts.types';

function idempotencyKey(key: string | undefined): string | undefined {
  if (key === undefined) return undefined;
  if (!isUUID(key, '4')) {
    throw new BadRequestException('Idempotency-Key must be a UUID v4');
  }
  return key;
}

@Controller('admin/procurement/goods-receipts')
export class GoodsReceiptsController {
  constructor(private readonly goodsReceiptsService: GoodsReceiptsService) {}

  @Roles(Role.STAFF, Role.ADMIN)
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<GoodsReceiptWithLines> {
    return this.goodsReceiptsService.findById(id);
  }

  @Roles(Role.STAFF, Role.ADMIN)
  @Patch(':id')
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateGoodsReceiptDto,
  ): Promise<GoodsReceiptWithLines> {
    return this.goodsReceiptsService.updateDraft(id, dto, user.id, user.role);
  }

  @Roles(Role.STAFF, Role.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.goodsReceiptsService.deleteDraft(id, user.id);
  }

  @Roles(Role.STAFF, Role.ADMIN)
  @Post(':id/post')
  post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key?: string,
  ): Promise<GoodsReceiptWithLines> {
    return this.goodsReceiptsService.post(
      id,
      user.id,
      user.role,
      idempotencyKey(key),
    );
  }

  @Roles(Role.ADMIN)
  @Post(':id/reverse')
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseGoodsReceiptDto,
  ): Promise<GoodsReceiptWithLines> {
    return this.goodsReceiptsService.reverse(id, dto.reason, user.id);
  }
}
