import { Module } from '@nestjs/common';

import { AuditModule } from '../../audit/audit.module';
import { InventoryModule } from '../../inventory/inventory.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts.service';
import { PurchaseOrderReceiptsController } from './purchase-order-receipts.controller';

@Module({
  imports: [AuditModule, InventoryModule, PurchaseOrdersModule],
  controllers: [GoodsReceiptsController, PurchaseOrderReceiptsController],
  providers: [GoodsReceiptsService],
  exports: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
