import { OffersModule } from '../offers/offers.module';
import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [OffersModule, InventoryModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
