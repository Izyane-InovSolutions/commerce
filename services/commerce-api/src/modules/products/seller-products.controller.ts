import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RequireVerifiedEmail } from '../../common/auth/require-verified-email.decorator';
import { AttachMediaDto } from './dto/attach-media.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { SellerUpdateProductDto } from './dto/seller-update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
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
 *
 * Edits and deletes follow the submission lifecycle (see
 * ProductsService.updateSellerProduct): a pending submission is edited in
 * place, a rejected one is edited and resubmitted, an approved one is 409.
 */
@ApiTags('Seller products')
@ApiBearerAuth()
@Controller('sellers/me/products')
@RequireVerifiedEmail()
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

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SellerUpdateProductDto,
  ): Promise<ProductWithRelations> {
    return this.productsService.updateSellerProduct(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.productsService.removeSellerProduct(user.id, id);
  }

  @Patch(':id/variants/:variantId')
  updateVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ): Promise<VariantWithRelations> {
    return this.productsService.updateSellerVariant(
      user.id,
      id,
      variantId,
      dto,
    );
  }

  @Delete(':id/variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ): Promise<void> {
    return this.productsService.removeSellerVariant(user.id, id, variantId);
  }
}
