import { UsersModule } from '../users/users.module';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FinancialsModule } from '../financials/financials.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminRefundsController } from './admin-refunds.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PendingPaymentProvider } from './pending-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider';
import type { PaymentProvider } from './payment-provider';
import { UnifiedPaymentProvider } from './unified-payment.provider';
import { GatewayPaymentsService } from './gateway-payments.service';
import { GatewayPaymentsController } from './gateway-payments.controller';
import { RefundCasesService } from './refund-cases.service';
import { FulfillmentCancellationRefundHandler } from './jobs/fulfillment-cancellation-refund.handler';

// Extracted from the provider factory below so the toggle logic itself is a
// plain, directly unit-testable function rather than only reachable by
// spinning up the whole module's DI graph.
export function resolvePaymentProvider(
  config: ConfigService,
  pending: PendingPaymentProvider,
  unified: UnifiedPaymentProvider,
): PaymentProvider {
  return config.get('PAYMENTS_PROVIDER', 'pending') === 'unified'
    ? unified
    : pending;
}

@Module({
  imports: [UsersModule, OrdersModule, FinancialsModule],
  controllers: [
    PaymentsController,
    GatewayPaymentsController,
    AdminRefundsController,
  ],
  providers: [
    PendingPaymentProvider,
    UnifiedPaymentProvider,
    GatewayPaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, PendingPaymentProvider, UnifiedPaymentProvider],
      useFactory: resolvePaymentProvider,
    },
    PaymentsService,
    RefundCasesService,
    FulfillmentCancellationRefundHandler,
  ],
  exports: [
    PAYMENT_PROVIDER,
    PaymentsService,
    RefundCasesService,
    FulfillmentCancellationRefundHandler,
  ],
})
export class PaymentsModule {}
