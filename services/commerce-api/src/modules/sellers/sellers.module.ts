import { ProductReferencesModule } from '../products/product-references.module';
import { UsersModule } from '../users/users.module';
import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SellersController } from './sellers.controller';
import { AdminSellersController } from './admin-sellers.controller';
import { SellersService } from './sellers.service';
import { StorefrontsService } from './storefronts.service';
import { StorefrontsController } from './storefronts.controller';

@Module({
  imports: [ProductReferencesModule, UsersModule, MediaModule],
  controllers: [
    SellersController,
    AdminSellersController,
    StorefrontsController,
  ],
  providers: [SellersService, StorefrontsService],
  exports: [SellersService, StorefrontsService],
})
export class SellersModule {}
