import { InventoryModule } from '../inventory/inventory.module';
import { MediaModule } from '../media/media.module';
import { Module } from '@nestjs/common';

import { SellersModule } from '../sellers/sellers.module';
import { AdminProductsController } from './admin-products.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { SellerProductsController } from './seller-products.controller';

@Module({
  imports: [MediaModule, InventoryModule, SellersModule],
  controllers: [
    ProductsController,
    AdminProductsController,
    SellerProductsController,
  ],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
