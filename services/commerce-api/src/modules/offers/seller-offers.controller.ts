import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { MarketplaceOffersService } from './marketplace-offers.service';
import type { OfferPage, SellerOffer } from './marketplace-offers.service';
import {
  CreateSellerOfferDto,
  UpdateSellerOfferDto,
  SellerOfferStatusDto,
  SellerOfferPriceDto,
} from './dto/seller-offer.dto';

@ApiTags('Seller offers')
@ApiBearerAuth()
@Controller('sellers/me/offers')
export class SellerOffersController {
  constructor(private readonly offers: MarketplaceOffersService) {}
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<OfferPage<SellerOffer>> {
    return this.offers.listOwn(user.id, query);
  }
  @Get(':id')
  find(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SellerOffer> {
    return this.offers.findOwn(user.id, id);
  }
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSellerOfferDto,
  ): Promise<SellerOffer> {
    return this.offers.create(user.id, dto);
  }
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSellerOfferDto,
  ): Promise<SellerOffer> {
    return this.offers.update(user.id, id, dto);
  }
  @Patch(':id/status')
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SellerOfferStatusDto,
  ): Promise<SellerOffer> {
    return this.offers.status(user.id, id, dto);
  }
  @Post(':id/prices')
  price(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SellerOfferPriceDto,
  ): Promise<SellerOffer> {
    return this.offers.price(user.id, id, dto);
  }
}
