import { Module } from '@nestjs/common';

import { NumberingModule } from '../../common/numbering/numbering.module';
import { AuditModule } from '../audit/audit.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { AdminShipmentsController } from './admin-shipments.controller';
import { CARRIER_PROVIDERS } from './carrier-provider.interface';
import { CarrierProviderRegistry } from './carrier-provider.registry';
import { CustomerShipmentsController } from './customer-shipments.controller';
import { ManualCarrierProvider } from './providers/manual-carrier.provider';
import { ShipmentTrackingPollerService } from './shipment-tracking-poller.service';
import { ShipmentsService } from './shipments.service';
import { ShippingWebhooksController } from './shipping-webhooks.controller';

@Module({
  imports: [AuditModule, NumberingModule, FulfillmentModule],
  controllers: [
    AdminShipmentsController,
    CustomerShipmentsController,
    ShippingWebhooksController,
  ],
  providers: [
    ShipmentsService,
    CarrierProviderRegistry,
    ManualCarrierProvider,
    {
      provide: CARRIER_PROVIDERS,
      useFactory: (manual: ManualCarrierProvider): ManualCarrierProvider[] => [manual],
      inject: [ManualCarrierProvider],
    },
    ShipmentTrackingPollerService,
  ],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
