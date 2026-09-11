import { Module } from '@nestjs/common';

import { AddressesModule } from '../users/addresses/addresses.module';
import { CartModule } from '../cart/cart.module';
import { FinancialsModule } from '../financials/financials.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SellersModule } from '../sellers/sellers.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { SellerOrdersController } from './seller-orders.controller';
import { SellerOrdersService } from './seller-orders.service';

@Module({
  imports: [
    CartModule,
    InventoryModule,
    AddressesModule,
    SellersModule,
    FinancialsModule,
  ],
  controllers: [OrdersController, SellerOrdersController],
  providers: [OrdersService, SellerOrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
