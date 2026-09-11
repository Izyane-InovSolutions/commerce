import { Module } from '@nestjs/common';

import { AdminInventoryController } from './admin-inventory.controller';
import { InventoryService } from './inventory.service';
import { WarehousesModule } from './warehouses/warehouses.module';

@Module({
  imports: [WarehousesModule],
  controllers: [AdminInventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
