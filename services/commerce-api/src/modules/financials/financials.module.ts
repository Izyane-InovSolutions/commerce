import { Module } from '@nestjs/common';

import { SellersModule } from '../sellers/sellers.module';
import { AdminFinancialsController } from './admin-financials.controller';
import { LedgerService } from './ledger.service';
import { SellerFinancialsController } from './seller-financials.controller';

@Module({
  imports: [SellersModule],
  controllers: [SellerFinancialsController, AdminFinancialsController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class FinancialsModule {}
