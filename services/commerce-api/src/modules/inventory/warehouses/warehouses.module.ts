import { Module } from '@nestjs/common';

import { AdminWarehousesController } from './admin-warehouses.controller';
import { WarehousesService } from './warehouses.service';

@Module({
  controllers: [AdminWarehousesController],
  providers: [WarehousesService],
  exports: [WarehousesService],
})
export class WarehousesModule {}
