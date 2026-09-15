import { OffersModule } from '../offers/offers.module';
import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartCleanupHandler } from './jobs/cart-cleanup.handler';

@Module({
  imports: [OffersModule, InventoryModule],
  controllers: [CartController],
  providers: [CartService, CartCleanupHandler],
  exports: [CartService, CartCleanupHandler],
})
export class CartModule {}
