import { Module, OnModuleInit } from '@nestjs/common';

import { InventoryModule } from '../../modules/inventory/inventory.module';
import { InventoryExpireReservationHandler } from '../../modules/inventory/jobs/inventory-expire-reservation.handler';
import { JobsModule } from '../jobs/jobs.module';
import { JobWorkerService } from '../jobs/job-worker.service';

// Composition point that wires domain-module job handlers into the generic
// JobWorkerService, keeping JobsModule (infra) and InventoryModule (domain)
// mutually unaware of each other — mirrors how AppModule composes feature
// modules.
@Module({
  imports: [JobsModule, InventoryModule],
})
export class WorkersModule implements OnModuleInit {
  constructor(
    private readonly jobWorkerService: JobWorkerService,
    private readonly inventoryExpireReservationHandler: InventoryExpireReservationHandler,
  ) {}

  onModuleInit(): void {
    this.jobWorkerService.registerHandler(
      this.inventoryExpireReservationHandler,
    );
  }
}
