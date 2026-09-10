import { Module } from '@nestjs/common';

import { PendingPaymentProvider } from './pending-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider';

@Module({
  providers: [
    PendingPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: PendingPaymentProvider },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
