import { Module } from '@nestjs/common';

import { AuditModule } from '../../audit/audit.module';
import { PaymentsModule } from '../../payments/payments.module';
import { OrdersModule } from '../orders.module';
import {
  AdminOrderCancellationController,
  CustomerOrderCancellationController,
} from './order-cancellation.controller';
import { OrderCancellationService } from './order-cancellation.service';

/**
 * Its own module rather than part of OrdersModule: stopping the payment
 * needs PaymentsModule, which itself imports OrdersModule.
 */
@Module({
  imports: [OrdersModule, PaymentsModule, AuditModule],
  controllers: [
    CustomerOrderCancellationController,
    AdminOrderCancellationController,
  ],
  providers: [OrderCancellationService],
})
export class OrderCancellationModule {}
