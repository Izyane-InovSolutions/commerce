import { Controller, Get, Query } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { SellersService } from '../sellers/sellers.service';
import { AttentionService, SellerAttention } from './attention.service';
import { SalesAnalyticsQueryDto } from './dto/sales-analytics-query.dto';
import { SalesAnalyticsService } from './sales-analytics.service';
import { SalesAnalyticsDto } from './sales-analytics.types';

/**
 * A seller's own dashboard numbers: the platform sales report scoped to
 * their order lines, and their own queues. Approved sellers only, like the
 * rest of `sellers/me`.
 */
@Controller('sellers/me/analytics')
export class SellerAnalyticsController {
  constructor(
    private readonly sellersService: SellersService,
    private readonly salesAnalyticsService: SalesAnalyticsService,
    private readonly attentionService: AttentionService,
  ) {}

  @Get('sales')
  async getSales(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesAnalyticsQueryDto,
  ): Promise<SalesAnalyticsDto> {
    const seller = await this.sellersService.requireApproved(user.id);
    return this.salesAnalyticsService.getSales(query, { sellerId: seller.id });
  }

  @Get('attention')
  async getAttention(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SellerAttention> {
    const seller = await this.sellersService.requireApproved(user.id);
    return this.attentionService.forSeller(seller.id);
  }
}
