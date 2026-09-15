import { Module } from '@nestjs/common';

import { FreeShippingRateProvider } from './free-shipping-rate.provider';
import { SHIPPING_RATE_PROVIDER } from './shipping-rate.provider';
import { ShippingService } from './shipping.service';

@Module({
  providers: [
    FreeShippingRateProvider,
    {
      provide: SHIPPING_RATE_PROVIDER,
      useExisting: FreeShippingRateProvider,
    },
    ShippingService,
  ],
  exports: [ShippingService, SHIPPING_RATE_PROVIDER],
})
export class ShippingModule {}
