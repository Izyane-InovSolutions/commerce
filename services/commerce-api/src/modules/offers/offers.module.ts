import { ProductReferencesModule } from '../products/product-references.module';
import { OfferReadService } from './offer-read.service';
import { Module } from '@nestjs/common';

import { AdminOffersController } from './admin-offers.controller';
import { OffersService } from './offers.service';
import { SellersModule } from '../sellers/sellers.module';
import { MarketplaceOffersService } from './marketplace-offers.service';
import { SellerOffersController } from './seller-offers.controller';
import { PublicOffersController } from './public-offers.controller';

@Module({
  imports: [ProductReferencesModule, SellersModule],
  controllers: [
    AdminOffersController,
    SellerOffersController,
    PublicOffersController,
  ],
  providers: [OfferReadService, OffersService, MarketplaceOffersService],
  exports: [OfferReadService, OffersService],
})
export class OffersModule {}
