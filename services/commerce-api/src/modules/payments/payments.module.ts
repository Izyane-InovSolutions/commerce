import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PendingPaymentProvider } from './pending-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [
    PendingPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: PendingPaymentProvider },
    PaymentsService,
  ],
  exports: [PAYMENT_PROVIDER, PaymentsService],
})
export class PaymentsModule {}
