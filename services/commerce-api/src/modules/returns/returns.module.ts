import { Module } from '@nestjs/common';

import { NumberingModule } from '../../common/numbering/numbering.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminReturnsController } from './admin-returns.controller';
import { CustomerReturnsController } from './customer-returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [InventoryModule, NumberingModule, PaymentsModule],
  controllers: [CustomerReturnsController, AdminReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
