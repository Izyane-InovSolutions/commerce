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
import { Role } from '@prisma/client';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AttachMediaDto } from './dto/attach-media.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ReviewProductSubmissionDto } from './dto/review-product-submission.dto';
import { UpdateProductMediaDto } from './dto/update-product-media.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { UpdateStatusDto } from '../../common/catalog/dto/update-status.dto';
import { ProductsService } from './products.service';
import { ProductWithRelations, VariantWithRelations } from './products.types';

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/catalog/products')
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(): Promise<ProductWithRelations[]> {
    return this.productsService.findAllAdmin();
  }

  /** Every seller-submitted product still waiting on a decision — the
   * review queue. A literal path segment, so it never collides with the
   * single-segment `:id` route below. */
  @Get('submissions/pending')
  pendingSubmissions(): Promise<ProductWithRelations[]> {
    return this.productsService.listPendingSubmissions();
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductWithRelations> {
    return this.productsService.findByIdAdmin(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto): Promise<ProductWithRelations> {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductWithRelations> {
    return this.productsService.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ): Promise<ProductWithRelations> {
    return this.productsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.productsService.remove(id);
  }

  /** Approving also publishes the product and every variant on it — there's
   * no separate publish step once a seller's submission is signed off. */
  @Post(':id/submissions/approve')
  approveSubmission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewProductSubmissionDto,
  ): Promise<ProductWithRelations> {
    return this.productsService.reviewSubmission(user.id, id, 'APPROVED', dto);
  }

  @Post(':id/submissions/reject')
  rejectSubmission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewProductSubmissionDto,
  ): Promise<ProductWithRelations> {
    return this.productsService.reviewSubmission(user.id, id, 'REJECTED', dto);
  }

  @Post(':id/variants')
  addVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVariantDto,
  ): Promise<VariantWithRelations> {
    return this.productsService.addVariant(id, dto);
  }

  @Patch(':id/variants/:variantId')
  updateVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ): Promise<VariantWithRelations> {
    return this.productsService.updateVariant(id, variantId, dto);
  }

  @Patch(':id/variants/:variantId/status')
  updateVariantStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateStatusDto,
  ): Promise<VariantWithRelations> {
    return this.productsService.updateVariantStatus(id, variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ): Promise<void> {
    return this.productsService.removeVariant(id, variantId);
  }

  @Post(':id/media')
  attachMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachMediaDto,
  ): Promise<ProductWithRelations> {
    return this.productsService.attachMedia(id, dto);
  }

  @Patch(':id/media/:mediaId')
  updateMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body() dto: UpdateProductMediaDto,
  ): Promise<ProductWithRelations> {
    return this.productsService.updateMedia(id, mediaId, dto);
  }

  @Delete(':id/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  detachMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<void> {
    return this.productsService.detachMedia(id, mediaId);
  }
}
