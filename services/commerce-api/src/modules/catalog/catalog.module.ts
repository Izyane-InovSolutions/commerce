import { Module } from '@nestjs/common';

import { AttributesModule } from './attributes/attributes.module';
import { BrandsModule } from './brands/brands.module';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [CategoriesModule, BrandsModule, AttributesModule],
})
export class CatalogModule {}
