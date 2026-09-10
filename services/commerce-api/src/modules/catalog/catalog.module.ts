import { Module } from '@nestjs/common';

import { AttributesModule } from './attributes/attributes.module';
import { BrandsModule } from './brands/brands.module';
import { CategoriesModule } from './categories/categories.module';
import { OffersModule } from './offers/offers.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    CategoriesModule,
    BrandsModule,
    AttributesModule,
    ProductsModule,
    OffersModule,
  ],
})
export class CatalogModule {}
