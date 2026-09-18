import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { isUUID } from 'class-validator';
import type { ProductReview, ReviewReport, SellerRating } from '@prisma/client';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { EditProductReviewDto } from './dto/edit-product-review.dto';
import { EditSellerRatingDto } from './dto/edit-seller-rating.dto';
import { ReportReviewDto } from './dto/report-review.dto';
import { SubmitProductReviewDto } from './dto/submit-product-review.dto';
import { SubmitSellerRatingDto } from './dto/submit-seller-rating.dto';
import { ReviewsService } from './reviews.service';
import type { OrderReviewEligibilityView, OwnReviewsPage } from './reviews.types';

// Stricter than the app-wide default (100/60s) — mirrors
// AUTH_BRUTE_FORCE_THROTTLE's naming convention in auth.controller.ts.
const REVIEW_WRITE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !isUUID(key, '4')) {
    throw new BadRequestException('Idempotency-Key header must be a UUID v4');
  }
  return key;
}

@Controller('reviews')
export class CustomerReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('eligibility')
  getEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Query('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<OrderReviewEligibilityView> {
    return this.reviewsService.getEligibility(user.id, orderId);
  }

  @Get('me')
  listOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<OwnReviewsPage> {
    return this.reviewsService.listOwn(user.id, query);
  }

  @Post('products')
  @Throttle(REVIEW_WRITE_THROTTLE)
  submitProductReview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitProductReviewDto,
  ): Promise<ProductReview> {
    return this.reviewsService.submitProductReview(user.id, dto);
  }

  @Post('sellers')
  @Throttle(REVIEW_WRITE_THROTTLE)
  submitSellerRating(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitSellerRatingDto,
  ): Promise<SellerRating> {
    return this.reviewsService.submitSellerRating(user.id, dto);
  }

  @Patch('products/:id')
  @Throttle(REVIEW_WRITE_THROTTLE)
  editProductReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditProductReviewDto,
    @Headers('idempotency-key') key: string,
  ): Promise<ProductReview> {
    return this.reviewsService.editProductReview(
      user.id,
      id,
      dto,
      requireIdempotencyKey(key),
    );
  }

  @Patch('sellers/:id')
  @Throttle(REVIEW_WRITE_THROTTLE)
  editSellerRating(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditSellerRatingDto,
    @Headers('idempotency-key') key: string,
  ): Promise<SellerRating> {
    return this.reviewsService.editSellerRating(
      user.id,
      id,
      dto,
      requireIdempotencyKey(key),
    );
  }

  @Delete('products/:id')
  @HttpCode(200)
  withdrawProductReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string,
  ): Promise<ProductReview> {
    return this.reviewsService.withdrawProductReview(
      user.id,
      id,
      requireIdempotencyKey(key),
    );
  }

  @Delete('sellers/:id')
  @HttpCode(200)
  withdrawSellerRating(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string,
  ): Promise<SellerRating> {
    return this.reviewsService.withdrawSellerRating(
      user.id,
      id,
      requireIdempotencyKey(key),
    );
  }

  @Post('products/:id/reports')
  @Throttle(REVIEW_WRITE_THROTTLE)
  reportProductReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportReviewDto,
    @Headers('idempotency-key') key: string,
  ): Promise<ReviewReport> {
    return this.reviewsService.reportProductReview(
      user.id,
      id,
      dto,
      requireIdempotencyKey(key),
    );
  }

  @Post('sellers/:id/reports')
  @Throttle(REVIEW_WRITE_THROTTLE)
  reportSellerRating(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportReviewDto,
    @Headers('idempotency-key') key: string,
  ): Promise<ReviewReport> {
    return this.reviewsService.reportSellerRating(
      user.id,
      id,
      dto,
      requireIdempotencyKey(key),
    );
  }
}
