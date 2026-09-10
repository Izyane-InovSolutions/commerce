import { Controller, Get, Param, Query } from '@nestjs/common';

import { Public } from '../../../common/auth/public.decorator';
import { PaginatedResult } from '../../../common/pagination/paginated-result';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductsService } from './products.service';
import { PublicProduct } from './products.types';

@Public()
@Controller('catalog/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(
    @Query() query: ProductQueryDto,
  ): Promise<PaginatedResult<PublicProduct>> {
    return this.productsService.findPublished(query);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string): Promise<PublicProduct> {
    return this.productsService.findPublishedBySlug(slug);
  }
}
