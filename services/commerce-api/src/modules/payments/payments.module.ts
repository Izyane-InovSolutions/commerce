import { Module } from '@nestjs/common';

import { UnifiedPaymentsProvider } from '../../integrations/payments/unified-payments.provider';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDER } from './payment-provider';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [
    UnifiedPaymentsProvider,
    { provide: PAYMENT_PROVIDER, useExisting: UnifiedPaymentsProvider },
    PaymentsService,
  ],
  exports: [PAYMENT_PROVIDER, PaymentsService],
})
export class PaymentsModule {}
