import { Controller, Get, Query } from '@nestjs/common';
import type { LedgerEntry } from '@prisma/client';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { SellersService } from '../sellers/sellers.service';
import { LedgerPage, LedgerService, SellerBalanceView } from './ledger.service';

@Controller('sellers/me')
export class SellerFinancialsController {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly sellersService: SellersService,
  ) {}

  @Get('balance')
  async balance(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SellerBalanceView> {
    const seller = await this.sellersService.requireApproved(user.id);
    return this.ledgerService.getBalance(seller.id);
  }

  @Get('ledger')
  async ledger(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<LedgerPage<LedgerEntry>> {
    const seller = await this.sellersService.requireApproved(user.id);
    return this.ledgerService.listEntries(seller.id, query);
  }
}
