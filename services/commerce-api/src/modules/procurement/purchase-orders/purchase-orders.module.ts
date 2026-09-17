import { Module } from '@nestjs/common';

import { NumberingModule } from '../../../common/numbering/numbering.module';
import { AuditModule } from '../../audit/audit.module';
import { WarehousesModule } from '../../inventory/warehouses/warehouses.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  imports: [AuditModule, WarehousesModule, SuppliersModule, NumberingModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService, NumberingModule],
})
export class PurchaseOrdersModule {}
