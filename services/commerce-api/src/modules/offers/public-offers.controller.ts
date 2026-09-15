import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { CurrencyQueryDto } from '../../common/catalog/dto/currency-query.dto';
import { PublicOfferQueryDto } from './dto/public-offer-query.dto';
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
    @Query() query: PublicOfferQueryDto,
  ): Promise<OfferPage<ComparableOffer>> {
    return this.offers.compare(id, query, query.currency);
  }
  @Get('catalog/offers/:id')
  find(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() currency: CurrencyQueryDto,
  ): Promise<ComparableOffer> {
    return this.offers.findPublic(id, currency.currency);
  }
  @Get('storefronts/:slug/offers')
  storefront(
    @Param('slug') slug: string,
    @Query() query: PublicOfferQueryDto,
  ): Promise<OfferPage<ComparableOffer>> {
    return this.offers.storefrontOffers(slug, query, query.currency);
  }
}
