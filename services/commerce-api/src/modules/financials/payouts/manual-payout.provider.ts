import { Injectable } from '@nestjs/common';

import {
  PayoutProvider,
  PayoutProviderInput,
  PayoutProviderResult,
} from './payout-provider';

/**
 * Safe first adapter: it never claims money moved automatically. Every
 * submission is handed to reconciliation with a durable provider reference,
 * where an admin can confirm or fail the external transfer.
 */
@Injectable()
export class ManualPayoutProvider implements PayoutProvider {
  readonly name = 'manual';

  submit(input: PayoutProviderInput): Promise<PayoutProviderResult> {
    return Promise.resolve({
      outcome: 'RECONCILIATION_REQUIRED',
      providerReference: `manual:${input.attemptId}`,
      response: {
        instructions: 'Complete and reconcile the transfer externally',
      },
    });
  }
}
