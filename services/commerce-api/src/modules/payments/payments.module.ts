import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PendingPaymentProvider } from './pending-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider';
import type { PaymentProvider } from './payment-provider';
import { UnifiedPaymentProvider } from './unified-payment.provider';
import { GatewayPaymentsService } from './gateway-payments.service';
import { GatewayPaymentsController } from './gateway-payments.controller';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController, GatewayPaymentsController],
  providers: [
    PendingPaymentProvider,
    UnifiedPaymentProvider,
    GatewayPaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, PendingPaymentProvider, UnifiedPaymentProvider],
      useFactory: (
        config: ConfigService,
        pending: PendingPaymentProvider,
        unified: UnifiedPaymentProvider,
      ): PaymentProvider =>
        config.get('PAYMENTS_PROVIDER', 'pending') === 'unified'
          ? unified
          : pending,
    },
    PaymentsService,
  ],
  exports: [PAYMENT_PROVIDER, PaymentsService],
})
export class PaymentsModule {}
