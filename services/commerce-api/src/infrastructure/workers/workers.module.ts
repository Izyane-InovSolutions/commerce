import { Module, OnModuleInit } from '@nestjs/common';

import { CartModule } from '../../modules/cart/cart.module';
import { CartCleanupHandler } from '../../modules/cart/jobs/cart-cleanup.handler';
import { FulfillmentModule } from '../../modules/fulfillment/fulfillment.module';
import { FulfillmentProvisionHandler } from '../../modules/fulfillment/jobs/fulfillment-provision.handler';
import { InventoryModule } from '../../modules/inventory/inventory.module';
import { InventoryExpireReservationHandler } from '../../modules/inventory/jobs/inventory-expire-reservation.handler';
import { PaymentsModule } from '../../modules/payments/payments.module';
import { FulfillmentCancellationRefundHandler } from '../../modules/payments/jobs/fulfillment-cancellation-refund.handler';
import { JobsModule } from '../jobs/jobs.module';
import { JobWorkerService } from '../jobs/job-worker.service';

// Composition point that wires domain-module job handlers into the generic
// JobWorkerService, keeping JobsModule (infra) and the domain modules
// mutually unaware of each other — mirrors how AppModule composes feature
// modules.
@Module({
  imports: [JobsModule, InventoryModule, CartModule, FulfillmentModule, PaymentsModule],
})
export class WorkersModule implements OnModuleInit {
  constructor(
    private readonly jobWorkerService: JobWorkerService,
    private readonly inventoryExpireReservationHandler: InventoryExpireReservationHandler,
    private readonly cartCleanupHandler: CartCleanupHandler,
    private readonly fulfillmentProvisionHandler: FulfillmentProvisionHandler,
    private readonly fulfillmentCancellationRefundHandler: FulfillmentCancellationRefundHandler,
  ) {}

  onModuleInit(): void {
    this.jobWorkerService.registerHandler(
      this.inventoryExpireReservationHandler,
    );
    this.jobWorkerService.registerHandler(this.cartCleanupHandler);
    this.jobWorkerService.registerHandler(this.fulfillmentProvisionHandler);
    this.jobWorkerService.registerHandler(
      this.fulfillmentCancellationRefundHandler,
    );
  }
}
