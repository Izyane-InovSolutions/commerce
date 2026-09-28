import { Controller, Get, Param } from '@nestjs/common';
import type { Category } from '@prisma/client';

import { Public } from '../../../common/auth/public.decorator';
import { CategoriesService } from './categories.service';
import {
  CategoryAttributesService,
  EffectiveCategoryAttribute,
} from './category-attributes.service';

@Public()
@Controller('catalog/categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly categoryAttributes: CategoryAttributesService,
  ) {}

  @Get()
  findAll(): Promise<Category[]> {
    return this.categoriesService.findAll();
  }

  /** What products in this category are described by, with each
   * attribute's values — inherited ones included. */
  @Get(':slug/attributes')
  findAttributes(
    @Param('slug') slug: string,
  ): Promise<EffectiveCategoryAttribute[]> {
    return this.categoryAttributes.effectiveBySlug(slug);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string): Promise<Category> {
    return this.categoriesService.findBySlug(slug);
  }
}
