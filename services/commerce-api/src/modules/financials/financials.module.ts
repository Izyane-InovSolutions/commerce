import { Module } from '@nestjs/common';

import { SellersModule } from '../sellers/sellers.module';
import { AuditModule } from '../audit/audit.module';
import { AdminFinancialsController } from './admin-financials.controller';
import { AdminPayoutsController } from './admin-payouts.controller';
import { LedgerService } from './ledger.service';
import { SellerFinancialsController } from './seller-financials.controller';
import { SellerPayoutsController } from './seller-payouts.controller';
import { ManualPayoutProvider } from './payouts/manual-payout.provider';
import { PAYOUT_PROVIDER } from './payouts/payout-provider';
import { PayoutProcessingService } from './payouts/payout-processing.service';
import { PayoutsService } from './payouts/payouts.service';

@Module({
  imports: [SellersModule, AuditModule],
  controllers: [
    SellerFinancialsController,
    SellerPayoutsController,
    AdminFinancialsController,
    AdminPayoutsController,
  ],
  providers: [
    LedgerService,
    PayoutsService,
    ManualPayoutProvider,
    { provide: PAYOUT_PROVIDER, useExisting: ManualPayoutProvider },
    PayoutProcessingService,
  ],
  exports: [LedgerService, PayoutsService],
})
export class FinancialsModule {}
