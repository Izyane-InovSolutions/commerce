import { Module } from '@nestjs/common';

import { AdminCategoriesController } from './admin-categories.controller';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CategoryAttributesService } from './category-attributes.service';

@Module({
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService, CategoryAttributesService],
  exports: [CategoriesService, CategoryAttributesService],
})
export class CategoriesModule {}
