import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { PaginatedResult } from '../../common/pagination/paginated-result';
import { SellersService } from './sellers.service';
import { SellerReviewFilterDto } from './dto/seller-review-filter.dto';
import {
  SellerRatingView,
  SellerReviewsService,
  SellerReviewView,
} from './seller-reviews.service';

// Read-only: sellers see their own review/rating feed, including moderation
// status, but get no approve/hide/remove/reply action here — those live in
// the admin moderation surface.
@ApiBearerAuth()
@ApiTags('Seller reviews')
@Controller('sellers/me')
export class SellerReviewsController {
  constructor(
    private readonly sellersService: SellersService,
    private readonly sellerReviews: SellerReviewsService,
  ) {}

  @Get('reviews')
  async reviews(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SellerReviewFilterDto,
  ): Promise<PaginatedResult<SellerReviewView>> {
    const seller = await this.sellersService.requireApproved(user.id);
    return this.sellerReviews.listReviews(seller.id, query);
  }

  @Get('ratings')
  async ratings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SellerReviewFilterDto,
  ): Promise<PaginatedResult<SellerRatingView>> {
    const seller = await this.sellersService.requireApproved(user.id);
    return this.sellerReviews.listRatings(seller.id, query);
  }
}
