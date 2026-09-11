import { Module } from '@nestjs/common';

import { AdminOffersController } from './admin-offers.controller';
import { OffersService } from './offers.service';
import { SellersModule } from '../sellers/sellers.module';
import { MarketplaceOffersService } from './marketplace-offers.service';
import { SellerOffersController } from './seller-offers.controller';
import { PublicOffersController } from './public-offers.controller';

@Module({
  imports: [SellersModule],
  controllers: [
    AdminOffersController,
    SellerOffersController,
    PublicOffersController,
  ],
  providers: [OffersService, MarketplaceOffersService],
  exports: [OffersService],
})
export class OffersModule {}
