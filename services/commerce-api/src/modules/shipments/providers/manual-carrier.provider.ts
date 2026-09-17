import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type {
  CarrierBookingRequest,
  CarrierBookingResult,
  CarrierProvider,
  CarrierTrackingEvent,
} from '../carrier-provider.interface';

/**
 * The default until a real carrier contract is selected — books everything
 * without calling any external courier. Never receives webhooks (no
 * `parseWebhook`) and never has anything new to report on poll, since there
 * is no live tracking behind it.
 */
@Injectable()
export class ManualCarrierProvider implements CarrierProvider {
  readonly providerCode = 'ZONE';

  book(request: CarrierBookingRequest): Promise<CarrierBookingResult> {
    return Promise.resolve({
      trackingReference: `MANUAL-${request.shipmentNumber}-${randomUUID().slice(0, 8)}`,
    });
  }

  cancel(): Promise<void> {
    return Promise.resolve();
  }

  poll(): Promise<CarrierTrackingEvent[]> {
    return Promise.resolve([]);
  }
}
