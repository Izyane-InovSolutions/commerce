import { Injectable } from '@nestjs/common';

import type {
  ShippingRate,
  ShippingRateProvider,
  ShippingRateRequest,
} from './shipping-rate.provider';

/** Local policy until a carrier/rate integration is selected. */
@Injectable()
export class FreeShippingRateProvider implements ShippingRateProvider {
  quote(_request: ShippingRateRequest): Promise<ShippingRate> {
    return Promise.resolve({
      serviceLevel: 'STANDARD',
      rateCode: 'FREE_STANDARD_V1',
      amount: 0,
    });
  }
}
