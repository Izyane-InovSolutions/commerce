import { Module } from '@nestjs/common';

import { GoodsReceiptsModule } from './goods-receipts/goods-receipts.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { SuppliersModule } from './suppliers/suppliers.module';

@Module({
  imports: [SuppliersModule, PurchaseOrdersModule, GoodsReceiptsModule],
})
export class ProcurementModule {}
