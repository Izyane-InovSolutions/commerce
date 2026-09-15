import { Module } from '@nestjs/common';

import { SHIPPING_RATE_PROVIDER } from './shipping-rate.provider';
import { ShippingService } from './shipping.service';
import { ZoneShippingRateProvider } from './zone-shipping-rate.provider';

@Module({
  providers: [
    ZoneShippingRateProvider,
    {
      provide: SHIPPING_RATE_PROVIDER,
      useExisting: ZoneShippingRateProvider,
    },
    ShippingService,
  ],
  exports: [ShippingService, SHIPPING_RATE_PROVIDER],
})
export class ShippingModule {}
