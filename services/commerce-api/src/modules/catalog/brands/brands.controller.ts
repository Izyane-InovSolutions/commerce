import { Controller, Get, Param } from '@nestjs/common';
import type { Brand } from '@prisma/client';

import { Public } from '../../../common/auth/public.decorator';
import { BrandsService } from './brands.service';

@Public()
@Controller('catalog/brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  findAll(): Promise<Brand[]> {
    return this.brandsService.findAll();
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string): Promise<Brand> {
    return this.brandsService.findBySlug(slug);
  }
}
