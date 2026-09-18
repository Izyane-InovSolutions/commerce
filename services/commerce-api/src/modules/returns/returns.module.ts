import { Module } from '@nestjs/common';

import { NumberingModule } from '../../common/numbering/numbering.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsModule } from '../payments/payments.module';
import { SellersModule } from '../sellers/sellers.module';
import { AdminReturnsController } from './admin-returns.controller';
import { CustomerReturnsController } from './customer-returns.controller';
import { ReturnsService } from './returns.service';
import { SellerReturnsController } from './seller-returns.controller';
import { SellerReturnsService } from './seller-returns.service';

@Module({
  imports: [InventoryModule, NumberingModule, PaymentsModule, SellersModule],
  controllers: [
    CustomerReturnsController,
    AdminReturnsController,
    SellerReturnsController,
  ],
  providers: [ReturnsService, SellerReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
