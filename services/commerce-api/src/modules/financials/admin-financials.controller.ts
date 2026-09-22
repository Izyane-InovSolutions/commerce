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
import { Role, type LedgerEntry, type Payout } from '@prisma/client';
import { isUUID } from 'class-validator';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Roles } from '../../common/auth/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { RecordPayoutDto } from './dto/record-payout.dto';
import {
  LedgerPage,
  LedgerService,
  SellerBalanceView,
  SellerBalanceIntegrity,
} from './ledger.service';

@Roles(Role.ADMIN)
@Controller('admin')
export class AdminFinancialsController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get('sellers/:id/balance/integrity')
  integrity(
    @Param('id', ParseUUIDPipe) sellerId: string,
  ): Promise<SellerBalanceIntegrity> {
    return this.ledgerService.checkIntegrity(sellerId);
  }

  @Get('sellers/:id/balance')
  balance(
    @Param('id', ParseUUIDPipe) sellerId: string,
  ): Promise<SellerBalanceView> {
    return this.ledgerService.getBalance(sellerId);
  }

  @Get('sellers/:id/ledger')
  ledger(
    @Param('id', ParseUUIDPipe) sellerId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<LedgerPage<LedgerEntry>> {
    return this.ledgerService.listEntries(sellerId, query);
  }

  @Post('sellers/:id/payouts')
  recordPayout(
    @Param('id', ParseUUIDPipe) sellerId: string,
    @Body() dto: RecordPayoutDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Payout> {
    if (!isUUID(key ?? '', '4')) {
      throw new BadRequestException('Idempotency-Key must be a UUID v4');
    }
    return this.ledgerService.recordPayout(
      sellerId,
      dto.amount,
      key,
      user.id,
      dto.reference,
      dto.note,
    );
  }

  /** Explicit name for the legacy/manual reconciliation path. The original
   * route remains compatible with existing admin clients. */
  @Post('sellers/:id/payouts/external')
  recordExternalPayout(
    @Param('id', ParseUUIDPipe) sellerId: string,
    @Body() dto: RecordPayoutDto,
    @Headers('idempotency-key') key: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Payout> {
    if (!isUUID(key ?? '', '4')) {
      throw new BadRequestException('Idempotency-Key must be a UUID v4');
    }
    return this.ledgerService.recordPayout(
      sellerId,
      dto.amount,
      key,
      user.id,
      dto.reference,
      dto.note,
    );
  }

  @Get('payouts')
  listPayouts(@Query() query: PaginationQueryDto): Promise<LedgerPage<Payout>> {
    return this.ledgerService.listPayouts(query);
  }
}
