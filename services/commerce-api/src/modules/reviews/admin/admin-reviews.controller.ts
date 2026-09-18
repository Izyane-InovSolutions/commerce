import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { isUUID } from 'class-validator';

import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { AdminReviewsService, assertAdminReviewType } from './admin-reviews.service';
import { ApproveModerationDto } from './dto/approve-moderation.dto';
import { DismissReportDto } from './dto/dismiss-report.dto';
import { ListAdminReviewsDto } from './dto/list-admin-reviews.dto';
import { ModerationActionDto } from './dto/moderation-action.dto';
import {
  AdminReviewDetail,
  AdminReviewPage,
  AdminReviewReportDismissal,
} from './admin-reviews.types';

function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !isUUID(key, '4')) {
    throw new BadRequestException('Idempotency-Key header must be a UUID v4');
  }
  return key;
}

/**
 * Admin moderation over both ProductReview and SellerRating rows (#38).
 * `:type` is 'product' | 'seller', encoding ReviewTargetType.PRODUCT_REVIEW /
 * SELLER_RATING as short URL-friendly segments — see admin-reviews.types.ts.
 * Customer submission/edit/report and public/seller read endpoints are
 * owned by other modules; this controller only ever changes
 * visibility/moderationState/ReviewReport.status.
 */
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminReviewsController {
  constructor(private readonly reviewsService: AdminReviewsService) {}

  @Get('reviews')
  list(@Query() query: ListAdminReviewsDto): Promise<AdminReviewPage> {
    return this.reviewsService.list(query);
  }

  @Get('reviews/:type/:id')
  findOne(
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminReviewDetail> {
    assertAdminReviewType(type);
    return this.reviewsService.findOne(type, id);
  }

  @Post('reviews/:type/:id/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveModerationDto,
    @Headers('idempotency-key') key: string,
  ): Promise<AdminReviewDetail> {
    assertAdminReviewType(type);
    return this.reviewsService.approve(
      type,
      id,
      dto,
      user.id,
      requireIdempotencyKey(key),
    );
  }

  @Post('reviews/:type/:id/hide')
  hide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationActionDto,
    @Headers('idempotency-key') key: string,
  ): Promise<AdminReviewDetail> {
    assertAdminReviewType(type);
    return this.reviewsService.hide(
      type,
      id,
      dto,
      user.id,
      requireIdempotencyKey(key),
    );
  }

  @Post('reviews/:type/:id/remove')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationActionDto,
    @Headers('idempotency-key') key: string,
  ): Promise<AdminReviewDetail> {
    assertAdminReviewType(type);
    return this.reviewsService.remove(
      type,
      id,
      dto,
      user.id,
      requireIdempotencyKey(key),
    );
  }

  @Post('reviews/:type/:id/restore')
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerationActionDto,
    @Headers('idempotency-key') key: string,
  ): Promise<AdminReviewDetail> {
    assertAdminReviewType(type);
    return this.reviewsService.restore(
      type,
      id,
      dto,
      user.id,
      requireIdempotencyKey(key),
    );
  }

  @Post('review-reports/:id/dismiss')
  dismissReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DismissReportDto,
    @Headers('idempotency-key') key: string,
  ): Promise<AdminReviewReportDismissal> {
    return this.reviewsService.dismissReport(
      id,
      dto,
      user.id,
      requireIdempotencyKey(key),
    );
  }
}
