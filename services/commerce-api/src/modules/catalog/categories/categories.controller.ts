import { Controller, Get, Param } from '@nestjs/common';
import type { Category } from '@prisma/client';

import { Public } from '../../../common/auth/public.decorator';
import { CategoriesService } from './categories.service';

@Public()
@Controller('catalog/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(): Promise<Category[]> {
    return this.categoriesService.findAll();
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string): Promise<Category> {
    return this.categoriesService.findBySlug(slug);
  }
}
