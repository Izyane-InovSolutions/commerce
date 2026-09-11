import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Role, type LedgerEntry, type Payout } from '@prisma/client';

import { Roles } from '../../common/auth/roles.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { RecordPayoutDto } from './dto/record-payout.dto';
import { LedgerPage, LedgerService, SellerBalanceView } from './ledger.service';

@Roles(Role.ADMIN)
@Controller('admin')
export class AdminFinancialsController {
  constructor(private readonly ledgerService: LedgerService) {}

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
  ): Promise<Payout> {
    return this.ledgerService.recordPayout(
      sellerId,
      dto.amount,
      dto.reference,
      dto.note,
    );
  }

  @Get('payouts')
  listPayouts(@Query() query: PaginationQueryDto): Promise<LedgerPage<Payout>> {
    return this.ledgerService.listPayouts(query);
  }
}
