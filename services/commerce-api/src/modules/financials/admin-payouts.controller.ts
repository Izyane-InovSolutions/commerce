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
import { PayoutAccountStatus, Role } from '@prisma/client';
import { isUUID } from 'class-validator';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { VerifyPayoutAccountDto } from './dto/payout-account.dto';
import {
  ListPayoutRequestsDto,
  ResolvePayoutRequestDto,
  ReviewPayoutRequestDto,
} from './dto/payout-request.dto';
import {
  AdminPayoutAccountView,
  PayoutBatchDetail,
  PayoutBatchPage,
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

@Roles(Role.ADMIN)
@Controller('admin')
export class AdminPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get('payout-accounts')
  accounts(@Query('sellerId') sellerId?: string): Promise<PayoutAccountView[]> {
    if (sellerId && !isUUID(sellerId, '4')) {
      throw new BadRequestException('sellerId must be a UUID v4');
    }
    return this.payouts.listAccounts(sellerId);
  }

  @Post('payout-accounts/:id/verify')
  verifyAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyPayoutAccountDto,
  ): Promise<PayoutAccountView> {
    if (dto.status === PayoutAccountStatus.DISABLED) {
      throw new BadRequestException(
        'Use account management to disable an account',
      );
    }
    return this.payouts.verifyAccount(id, dto, user.id);
  }

  @Get('payout-accounts/:id')
  account(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminPayoutAccountView> {
    return this.payouts.findAccountForAdmin(id, user.id);
  }

  @Get('payout-requests')
  requests(@Query() query: ListPayoutRequestsDto): Promise<PayoutRequestPage> {
    return this.payouts.listRequests(query);
  }

  @Get('payout-requests/:id')
  request(@Param('id', ParseUUIDPipe) id: string): Promise<PayoutRequestView> {
    return this.payouts.findAdminRequest(id);
  }

  @Post('payout-requests/:id/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPayoutRequestDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<PayoutRequestView> {
    return this.payouts.approve(id, dto, user.id, requireIdempotencyKey(key));
  }

  @Post('payout-requests/:id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPayoutRequestDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<PayoutRequestView> {
    return this.payouts.reject(id, dto, user.id, requireIdempotencyKey(key));
  }

  @Post('payout-requests/:id/retry')
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPayoutRequestDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<PayoutRequestView> {
    return this.payouts.retry(id, dto, user.id, requireIdempotencyKey(key));
  }

  @Post('payout-requests/:id/resolve')
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePayoutRequestDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<PayoutRequestView> {
    return this.payouts.resolve(id, dto, user.id, requireIdempotencyKey(key));
  }

  @Post('payout-batches/process')
  async processBatch(): Promise<{ batchId: string | null }> {
    const batchId = await this.payouts.createBatch();
    if (batchId) await this.payouts.processBatch(batchId);
    return { batchId };
  }

  @Get('payout-batches')
  batches(@Query() query: PaginationQueryDto): Promise<PayoutBatchPage> {
    return this.payouts.listBatches(query);
  }

  @Get('payout-batches/:id')
  batch(@Param('id', ParseUUIDPipe) id: string): Promise<PayoutBatchDetail> {
    return this.payouts.findBatch(id);
  }
}
