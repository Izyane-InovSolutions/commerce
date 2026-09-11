import { Module } from '@nestjs/common';

import { AdminInventoryController } from './admin-inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryExpireReservationHandler } from './jobs/inventory-expire-reservation.handler';
import { WarehousesModule } from './warehouses/warehouses.module';

@Module({
  imports: [WarehousesModule],
  controllers: [AdminInventoryController],
  providers: [InventoryService, InventoryExpireReservationHandler],
  exports: [InventoryService, InventoryExpireReservationHandler],
})
export class InventoryModule {}
