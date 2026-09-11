import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { MarketplaceOffersService } from './marketplace-offers.service';
import type { ComparableOffer, OfferPage } from './marketplace-offers.service';

@ApiTags('Offer comparison')
@Public()
@Controller()
export class PublicOffersController {
  constructor(private readonly offers: MarketplaceOffersService) {}
  @Get('catalog/variants/:id/offers')
  compare(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<OfferPage<ComparableOffer>> {
    return this.offers.compare(id, query);
  }
  @Get('catalog/offers/:id')
  find(@Param('id', ParseUUIDPipe) id: string): Promise<ComparableOffer> {
    return this.offers.findPublic(id);
  }
  @Get('storefronts/:slug/offers')
  storefront(
    @Param('slug') slug: string,
    @Query() query: PaginationQueryDto,
  ): Promise<OfferPage<ComparableOffer>> {
    return this.offers.storefrontOffers(slug, query);
  }
}
