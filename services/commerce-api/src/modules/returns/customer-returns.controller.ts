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
import { isUUID } from 'class-validator';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CancelReturnDto } from './dto/cancel-return.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { ReturnsService } from './returns.service';
import { ItemEligibilityView, ReturnRequestWithDetail } from './returns.types';

function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !isUUID(key, '4')) {
    throw new BadRequestException('Idempotency-Key header must be a UUID v4');
  }
  return key;
}

@Controller()
export class CustomerReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get('orders/:orderId/return-eligibility')
  getEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<ItemEligibilityView[]> {
    return this.returnsService.getEligibility(user.id, orderId);
  }

  @Post('orders/:orderId/returns')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateReturnDto,
    @Headers('idempotency-key') key: string,
  ): Promise<ReturnRequestWithDetail> {
    return this.returnsService.requestReturn(
      orderId,
      dto.items,
      requireIdempotencyKey(key),
      user.id,
    );
  }

  @Get('returns')
  list(@CurrentUser() user: AuthenticatedUser): Promise<ReturnRequestWithDetail[]> {
    return this.returnsService.listOwn(user.id);
  }

  @Get('returns/:id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReturnRequestWithDetail> {
    return this.returnsService.findOwn(user.id, id);
  }

  @Post('returns/:id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelReturnDto,
  ): Promise<ReturnRequestWithDetail> {
    return this.returnsService.cancelReturn(user.id, id, dto.version);
  }
}
