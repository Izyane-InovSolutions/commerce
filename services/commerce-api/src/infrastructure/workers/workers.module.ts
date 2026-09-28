import { PaymentReconciliationHandler } from '../../modules/payments/jobs/payment-reconciliation.handler';
import { Module, OnModuleInit } from '@nestjs/common';

import { CartModule } from '../../modules/cart/cart.module';
import { CartCleanupHandler } from '../../modules/cart/jobs/cart-cleanup.handler';
import { FulfillmentModule } from '../../modules/fulfillment/fulfillment.module';
import { FulfillmentProvisionHandler } from '../../modules/fulfillment/jobs/fulfillment-provision.handler';
import { InventoryModule } from '../../modules/inventory/inventory.module';
import { InventoryExpireReservationHandler } from '../../modules/inventory/jobs/inventory-expire-reservation.handler';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { NotificationsOutboxSubscriber } from '../../modules/notifications/notifications-outbox.subscriber';
import { PaymentsModule } from '../../modules/payments/payments.module';
import { FulfillmentCancellationRefundHandler } from '../../modules/payments/jobs/fulfillment-cancellation-refund.handler';
import { EmailModule } from '../email/email.module';
import { EmailSendHandler } from '../email/email-send.handler';
import { JobsModule } from '../jobs/jobs.module';
import { JobWorkerService } from '../jobs/job-worker.service';
import { OutboxDispatcherService } from '../jobs/outbox-dispatcher.service';

// Composition point that wires domain-module job handlers into the generic
// JobWorkerService, and outbox subscribers into OutboxDispatcherService,
// keeping JobsModule (infra) and the domain modules mutually unaware of each
// other — mirrors how AppModule composes feature modules.
@Module({
  imports: [
    JobsModule,
    EmailModule,
    InventoryModule,
    CartModule,
    FulfillmentModule,
    PaymentsModule,
    NotificationsModule,
  ],
})
export class WorkersModule implements OnModuleInit {
  constructor(
    private readonly paymentReconciliationHandler: PaymentReconciliationHandler,
    private readonly jobWorkerService: JobWorkerService,
    private readonly inventoryExpireReservationHandler: InventoryExpireReservationHandler,
    private readonly cartCleanupHandler: CartCleanupHandler,
    private readonly fulfillmentProvisionHandler: FulfillmentProvisionHandler,
    private readonly fulfillmentCancellationRefundHandler: FulfillmentCancellationRefundHandler,
    private readonly outboxDispatcherService: OutboxDispatcherService,
    private readonly notificationsOutboxSubscriber: NotificationsOutboxSubscriber,
    private readonly emailSendHandler: EmailSendHandler,
  ) {}

  onModuleInit(): void {
    this.jobWorkerService.registerHandler(this.paymentReconciliationHandler);
    this.jobWorkerService.registerHandler(
      this.inventoryExpireReservationHandler,
    );
    this.jobWorkerService.registerHandler(this.cartCleanupHandler);
    this.jobWorkerService.registerHandler(this.fulfillmentProvisionHandler);
    this.jobWorkerService.registerHandler(
      this.fulfillmentCancellationRefundHandler,
    );
    this.outboxDispatcherService.registerSubscriber(
      this.notificationsOutboxSubscriber,
    );
    this.jobWorkerService.registerHandler(this.emailSendHandler);
  }
}
