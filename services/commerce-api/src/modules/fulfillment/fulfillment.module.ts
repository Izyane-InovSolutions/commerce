import { Module } from '@nestjs/common';

import { NumberingModule } from '../../common/numbering/numbering.module';
import { AuditModule } from '../audit/audit.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SellersModule } from '../sellers/sellers.module';
import { AdminFulfillmentsController } from './admin-fulfillments.controller';
import { SellerFulfillmentsController } from './seller-fulfillments.controller';
import { FulfillmentsService } from './fulfillments.service';
import { FulfillmentProvisionHandler } from './jobs/fulfillment-provision.handler';
import { FulfillmentProvisioningService } from './provisioning/fulfillment-provisioning.service';

@Module({
  imports: [AuditModule, InventoryModule, NumberingModule, SellersModule],
  controllers: [AdminFulfillmentsController, SellerFulfillmentsController],
  providers: [
    FulfillmentsService,
    FulfillmentProvisioningService,
    FulfillmentProvisionHandler,
  ],
  exports: [FulfillmentsService, FulfillmentProvisioningService, FulfillmentProvisionHandler],
})
export class FulfillmentModule {}
