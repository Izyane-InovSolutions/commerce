import { Controller, Get, Query } from '@nestjs/common';

import { Public } from '../../common/auth/public.decorator';
import { DealsQueryDto } from './dto/deals-query.dto';
import { ProductsService } from './products.service';
import { DealsResult } from './products.types';

/**
 * Products on sale now: an offer whose current price is time-limited and
 * lower than its regular price (see pickSale). Own path for the same reason
 * as best sellers — `catalog/products/:slug` would shadow it.
 */
@Public()
@Controller('catalog/deals')
export class DealsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: DealsQueryDto): Promise<DealsResult> {
    return this.productsService.findDeals(query);
  }
}
