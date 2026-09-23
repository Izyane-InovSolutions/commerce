import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AttachMediaDto } from './dto/attach-media.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ProductsService } from './products.service';
import { ProductWithRelations, VariantWithRelations } from './products.types';

/**
 * A seller's own brand-new catalog products, submitted for admin review —
 * distinct from `sellers/me/offers`, which lists against a product the
 * platform already published.
 *
 * No @Roles decorator — a seller-only, own-resource surface gated entirely
 * inside ProductsService via SellersService.requireApproved plus the
 * cross-tenant 404 ownership check, mirroring SellerOffersController and
 * SellerFulfillmentsController.
 */
@ApiTags('Seller products')
@ApiBearerAuth()
@Controller('sellers/me/products')
export class SellerProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductWithRelations[]> {
    return this.productsService.listOwnSubmissions(user.id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductWithRelations> {
    return this.productsService.findOwnSubmission(user.id, id);
  }

  @Post()
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ): Promise<ProductWithRelations> {
    return this.productsService.submitProduct(user.id, dto);
  }

  @Post(':id/variants')
  addVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVariantDto,
  ): Promise<VariantWithRelations> {
    return this.productsService.addSellerVariant(user.id, id, dto);
  }

  @Post(':id/media')
  attachMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachMediaDto,
  ): Promise<ProductWithRelations> {
    return this.productsService.attachSellerMedia(user.id, id, dto);
  }
}
