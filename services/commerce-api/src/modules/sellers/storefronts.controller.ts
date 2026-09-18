import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PaginatedResult } from '../../common/pagination/paginated-result';
import { ReviewListQueryDto } from '../reviews/dto/review-list-query.dto';
import { StorefrontsService } from './storefronts.service';
import type {
  PublicSellerRating,
  PublicStorefrontDetail,
} from './storefronts.service';
import { UpdateStorefrontDto } from './dto/update-storefront.dto';

@ApiTags('Storefronts')
@Controller()
export class StorefrontsController {
  constructor(private readonly storefronts: StorefrontsService) {}

  @Public()
  @Get('storefronts/:slug')
  find(@Param('slug') slug: string): Promise<PublicStorefrontDetail> {
    return this.storefronts.findPublic(slug);
  }

  @Public()
  @Get('storefronts/:slug/ratings')
  ratings(
    @Param('slug') slug: string,
    @Query() query: ReviewListQueryDto,
  ): Promise<PaginatedResult<PublicSellerRating>> {
    return this.storefronts.findPublicRatings(slug, query);
  }

  @ApiBearerAuth()
  @Put('sellers/me/storefront')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateStorefrontDto,
  ): Promise<PublicStorefrontDetail & { version: number }> {
    return this.storefronts.update(user.id, dto);
  }
}
