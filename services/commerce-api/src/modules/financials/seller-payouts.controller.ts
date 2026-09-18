import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { isUUID } from 'class-validator';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import {
  PayoutAccountVersionDto,
  SavePayoutAccountDto,
  UpdatePayoutAccountDto,
} from './dto/payout-account.dto';
import {
  CancelPayoutRequestDto,
  CreatePayoutRequestDto,
  ListPayoutRequestsDto,
} from './dto/payout-request.dto';
import {
  PayoutAccountView,
  PayoutRequestPage,
  PayoutRequestView,
  PayoutsService,
} from './payouts/payouts.service';

function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !isUUID(key, '4')) {
    throw new BadRequestException('Idempotency-Key header must be a UUID v4');
  }
  return key;
}

@Controller('sellers/me')
export class SellerPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get('payout-accounts')
  accounts(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PayoutAccountView[]> {
    return this.payouts.listOwnAccounts(user.id);
  }

  @Post('payout-accounts')
  createAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SavePayoutAccountDto,
  ): Promise<PayoutAccountView> {
    return this.payouts.createAccount(user.id, dto);
  }

  @Patch('payout-accounts/:id')
  updateAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayoutAccountDto,
  ): Promise<PayoutAccountView> {
    return this.payouts.updateAccount(user.id, id, dto);
  }

  @Post('payout-accounts/:id/disable')
  disableAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayoutAccountVersionDto,
  ): Promise<PayoutAccountView> {
    return this.payouts.disableAccount(user.id, id, dto);
  }

  @Get('payout-requests')
  requests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPayoutRequestsDto,
  ): Promise<PayoutRequestPage> {
    return this.payouts.listOwnRequests(user.id, query);
  }

  @Get('payout-requests/:id')
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PayoutRequestView> {
    return this.payouts.findOwnRequest(user.id, id);
  }

  @Post('payout-requests')
  createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayoutRequestDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<PayoutRequestView> {
    return this.payouts.createRequest(user.id, dto, requireIdempotencyKey(key));
  }

  @Post('payout-requests/:id/cancel')
  cancelRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelPayoutRequestDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<PayoutRequestView> {
    return this.payouts.cancelOwnRequest(
      user.id,
      id,
      dto,
      requireIdempotencyKey(key),
    );
  }
}
