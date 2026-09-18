import { Controller, Get, Param, Query } from '@nestjs/common';

import { Public } from '../../common/auth/public.decorator';
import { CurrencyQueryDto } from '../../common/catalog/dto/currency-query.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';
import { ReviewListQueryDto } from '../reviews/dto/review-list-query.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductsService } from './products.service';
import { PublicProduct, PublicProductReview } from './products.types';

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
  findBySlug(
    @Param('slug') slug: string,
    @Query() query: CurrencyQueryDto,
  ): Promise<PublicProduct> {
    return this.productsService.findPublishedBySlug(slug, query.currency);
  }

  @Get(':slug/reviews')
  findReviews(
    @Param('slug') slug: string,
    @Query() query: ReviewListQueryDto,
  ): Promise<PaginatedResult<PublicProductReview>> {
    return this.productsService.findPublicReviews(slug, query);
  }
}
