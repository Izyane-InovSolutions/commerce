import { OffersModule } from '../offers/offers.module';
import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [OffersModule, InventoryModule],
  controllers: [WishlistController],
  providers: [WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
