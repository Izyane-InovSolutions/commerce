import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { isUUID } from 'class-validator';

import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { GoodsReceiptsService } from './goods-receipts.service';
import { GoodsReceiptWithLines } from './goods-receipts.types';

/** Absent is fine — a caller that sends none simply gets no retry dedup. */
function idempotencyKey(key: string | undefined): string | undefined {
  if (key === undefined) return undefined;
  if (!isUUID(key, '4')) {
    throw new BadRequestException('Idempotency-Key must be a UUID v4');
  }
  return key;
}

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/procurement/purchase-orders/:purchaseOrderId/receipts')
export class PurchaseOrderReceiptsController {
  constructor(private readonly goodsReceiptsService: GoodsReceiptsService) {}

  @Get()
  findAll(
    @Param('purchaseOrderId', ParseUUIDPipe) purchaseOrderId: string,
  ): Promise<GoodsReceiptWithLines[]> {
    return this.goodsReceiptsService.listForPurchaseOrder(purchaseOrderId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('purchaseOrderId', ParseUUIDPipe) purchaseOrderId: string,
    @Body() dto: CreateGoodsReceiptDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<GoodsReceiptWithLines> {
    return this.goodsReceiptsService.createAndMaybePost(
      purchaseOrderId,
      dto,
      user.id,
      user.role,
      idempotencyKey(key),
    );
  }
}
