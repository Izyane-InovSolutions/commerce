import { Controller, Get, Query } from '@nestjs/common';

import { Public } from '../../common/auth/public.decorator';
import { BestSellersQueryDto } from './dto/best-sellers-query.dto';
import { ProductsService } from './products.service';
import { BestSellersResult } from './products.types';

/**
 * Its own path rather than `catalog/products/best-sellers`, which the
 * `catalog/products/:slug` route would otherwise have to be ordered around
 * (and which would shadow a product whose slug is "best-sellers").
 */
@Public()
@Controller('catalog/best-sellers')
export class BestSellersController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: BestSellersQueryDto): Promise<BestSellersResult> {
    return this.productsService.findBestSellers(query);
  }
}
