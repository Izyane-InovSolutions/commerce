import { Module } from '@nestjs/common';

import { AuditModule } from '../../audit/audit.module';
import { WarehousesModule } from '../../inventory/warehouses/warehouses.module';
import { NumberingService } from '../numbering.service';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  imports: [AuditModule, WarehousesModule, SuppliersModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, NumberingService],
  exports: [PurchaseOrdersService, NumberingService],
})
export class PurchaseOrdersModule {}
