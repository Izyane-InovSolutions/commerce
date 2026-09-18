import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  Prisma,
  ReviewModerationAction,
  ReviewModerationState,
  ReviewReportStatus,
  ReviewRevisionSource,
  ReviewTargetType,
  ReviewVisibility,
  type ProductReview,
  type ReviewReport,
  type SellerRating,
} from '@prisma/client';

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  PaginationQueryDto,
} from '../../common/pagination/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { OutboxService } from '../../infrastructure/jobs/outbox.service';
import { EditProductReviewDto } from './dto/edit-product-review.dto';
import { EditSellerRatingDto } from './dto/edit-seller-rating.dto';
import { ReportReviewDto } from './dto/report-review.dto';
import { SubmitProductReviewDto } from './dto/submit-product-review.dto';
import { SubmitSellerRatingDto } from './dto/submit-seller-rating.dto';
import { RatingAggregateService } from './rating-aggregate.service';
import { ReviewEligibilityService } from './review-eligibility.service';
import type { OrderReviewEligibilityView, OwnReviewsPage } from './reviews.types';

const EDIT_WINDOW_DAYS = 30;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: ReviewEligibilityService,
    private readonly ratingAggregate: RatingAggregateService,
    private readonly outbox: OutboxService,
  ) {}

  // -----------------------------------------------------------------------
  // Eligibility / own reviews
  // -----------------------------------------------------------------------

  getEligibility(
    userId: string,
    orderId: string,
  ): Promise<OrderReviewEligibilityView> {
    return this.eligibility.getOrderEligibility(userId, orderId);
  }

  async listOwn(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<OwnReviewsPage> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    // A customer's own review/rating count is bounded (one per delivered
    // order item / seller order they've bought from), so an in-memory merge
    // across the two tables is simpler than a cross-table SQL union and
    // still paginates correctly by createdAt.
    const [reviews, ratings] = await Promise.all([
      this.prisma.productReview.findMany({ where: { authorUserId: userId } }),
      this.prisma.sellerRating.findMany({ where: { authorUserId: userId } }),
    ]);
    const merged = [
      ...reviews.map((r) => ({ kind: 'PRODUCT_REVIEW' as const, ...r })),
      ...ratings.map((r) => ({ kind: 'SELLER_RATING' as const, ...r })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = merged.length;
    const start = (page - 1) * limit;
    return { items: merged.slice(start, start + limit), total, page, limit };
  }

  // -----------------------------------------------------------------------
  // Submission
  // -----------------------------------------------------------------------

  async submitProductReview(
    userId: string,
    dto: SubmitProductReviewDto,
  ): Promise<ProductReview> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { orderItem, coverage } =
          await this.eligibility.computeProductEligibilityForSubmission(
            tx,
            userId,
            dto.orderItemId,
          );
        if (orderItem.review) {
          throw new ConflictException(
            'A review already exists for this order item',
          );
        }
        if (!coverage.eligible) {
          throw new ConflictException(
            `Order item is not eligible for a review: ${coverage.reason}`,
          );
        }

        const now = new Date();
        const editDeadline = addDays(now, EDIT_WINDOW_DAYS);
        const variant = orderItem.offer.variant;
        const product = variant.product;

        const created = await tx.productReview.create({
          data: {
            orderItemId: orderItem.id,
            authorUserId: userId,
            productId: product.id,
            variantId: variant.id,
            offerId: orderItem.offerId,
            sellerId: orderItem.offer.sellerId,
            rating: dto.rating,
            title: dto.title,
            body: dto.body,
            deliveredAt: coverage.lastDeliveredAt!,
            verifiedAt: now,
            editDeadline,
          },
        });

        await tx.productReviewRevision.create({
          data: {
            productReviewId: created.id,
            revisionNumber: 1,
            rating: created.rating,
            title: created.title,
            body: created.body,
            authorUserId: userId,
            source: ReviewRevisionSource.SUBMISSION,
          },
        });

        await tx.reviewModerationEvent.create({
          data: {
            targetType: ReviewTargetType.PRODUCT_REVIEW,
            targetId: created.id,
            action: ReviewModerationAction.SUBMITTED,
            actorUserId: userId,
            previousVisibility: null,
            resultingVisibility: ReviewVisibility.PUBLISHED,
            previousModerationState: null,
            resultingModerationState: ReviewModerationState.PENDING,
          },
        });

        await this.ratingAggregate.recalculateProductSummary(tx, product.id);
        await this.outbox.record(
          {
            topic: 'product_review.submitted',
            aggregateType: 'product_review',
            aggregateId: created.id,
            payload: {
              orderItemId: created.orderItemId,
              productId: created.productId,
              authorUserId: userId,
            },
          },
          tx,
        );

        return created;
      });
    } catch (error) {
      throw this.mapWriteError(
        error,
        'A review already exists for this order item',
      );
    }
  }

  async submitSellerRating(
    userId: string,
    dto: SubmitSellerRatingDto,
  ): Promise<SellerRating> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { sellerOrder, coverage, isOwnSeller } =
          await this.eligibility.computeSellerEligibilityForSubmission(
            tx,
            userId,
            dto.sellerOrderId,
          );
        if (sellerOrder.rating) {
          throw new ConflictException(
            'A rating already exists for this seller order',
          );
        }
        if (isOwnSeller) {
          throw new ConflictException(
            'You cannot rate your own seller account',
          );
        }
        if (!coverage.eligible) {
          throw new ConflictException(
            `Seller order is not eligible for a rating: ${coverage.reason}`,
          );
        }

        const now = new Date();
        const editDeadline = addDays(now, EDIT_WINDOW_DAYS);

        const created = await tx.sellerRating.create({
          data: {
            sellerOrderId: sellerOrder.id,
            authorUserId: userId,
            sellerId: sellerOrder.sellerId!,
            rating: dto.rating,
            comment: dto.comment,
            deliveredAt: coverage.lastDeliveredAt!,
            verifiedAt: now,
            editDeadline,
          },
        });

        await tx.sellerRatingRevision.create({
          data: {
            sellerRatingId: created.id,
            revisionNumber: 1,
            rating: created.rating,
            comment: created.comment,
            authorUserId: userId,
            source: ReviewRevisionSource.SUBMISSION,
          },
        });

        await tx.reviewModerationEvent.create({
          data: {
            targetType: ReviewTargetType.SELLER_RATING,
            targetId: created.id,
            action: ReviewModerationAction.SUBMITTED,
            actorUserId: userId,
            previousVisibility: null,
            resultingVisibility: ReviewVisibility.PUBLISHED,
            previousModerationState: null,
            resultingModerationState: ReviewModerationState.PENDING,
          },
        });

        await this.ratingAggregate.recalculateSellerSummary(
          tx,
          created.sellerId,
        );
        await this.outbox.record(
          {
            topic: 'seller_rating.submitted',
            aggregateType: 'seller_rating',
            aggregateId: created.id,
            payload: {
              sellerOrderId: created.sellerOrderId,
              sellerId: created.sellerId,
              authorUserId: userId,
            },
          },
          tx,
        );

        return created;
      });
    } catch (error) {
      throw this.mapWriteError(
        error,
        'A rating already exists for this seller order',
      );
    }
  }

  // -----------------------------------------------------------------------
  // Edit
  // -----------------------------------------------------------------------

  async editProductReview(
    userId: string,
    id: string,
    dto: EditProductReviewDto,
    idempotencyKey: string,
  ): Promise<ProductReview> {
    const requestHash = this.hashRequest({
      id,
      rating: dto.rating ?? null,
      title: dto.title ?? null,
      body: dto.body ?? null,
    });
    const replay = await this.checkEditReplay(
      idempotencyKey,
      id,
      requestHash,
      ReviewModerationAction.EDITED,
    );
    if (replay) return this.findOwnProductReview(userId, id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM product_reviews WHERE id = ${id}::uuid FOR UPDATE`;
        const review = await tx.productReview.findUnique({ where: { id } });
        if (!review || review.authorUserId !== userId) {
          throw new NotFoundException('Review not found');
        }
        if (review.version !== dto.version) {
          throw new ConflictException('Review changed; reload and try again');
        }
        if (
          review.visibility === ReviewVisibility.REMOVED ||
          review.visibility === ReviewVisibility.WITHDRAWN
        ) {
          throw new ConflictException(
            `Cannot edit a review with visibility ${review.visibility}`,
          );
        }
        if (review.editDeadline.getTime() < Date.now()) {
          throw new ConflictException('Edit window has closed');
        }

        const nextRevisionNumber =
          (await tx.productReviewRevision.count({
            where: { productReviewId: id },
          })) + 1;
        const newRating = dto.rating ?? review.rating;
        const newTitle = dto.title !== undefined ? dto.title : review.title;
        const newBody = dto.body ?? review.body;

        const result = await tx.productReview.updateMany({
          where: { id, version: dto.version },
          data: {
            rating: newRating,
            title: newTitle,
            body: newBody,
            // Edit-resets-moderation-to-PENDING is applied uniformly
            // regardless of visibility (PUBLISHED or HIDDEN) for internal
            // consistency; visibility itself is left untouched here — a
            // HIDDEN review stays HIDDEN until an admin restores it.
            moderationState: ReviewModerationState.PENDING,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) {
          throw new ConflictException('Review changed; reload and try again');
        }

        await tx.productReviewRevision.create({
          data: {
            productReviewId: id,
            revisionNumber: nextRevisionNumber,
            rating: newRating,
            title: newTitle,
            body: newBody,
            authorUserId: userId,
            source: ReviewRevisionSource.CUSTOMER_EDIT,
          },
        });

        await tx.reviewModerationEvent.create({
          data: {
            targetType: ReviewTargetType.PRODUCT_REVIEW,
            targetId: id,
            action: ReviewModerationAction.EDITED,
            actorUserId: userId,
            previousVisibility: review.visibility,
            resultingVisibility: review.visibility,
            previousModerationState: review.moderationState,
            resultingModerationState: ReviewModerationState.PENDING,
            idempotencyKey,
            requestHash,
          },
        });

        if (review.visibility === ReviewVisibility.PUBLISHED) {
          await this.ratingAggregate.recalculateProductSummary(
            tx,
            review.productId,
          );
        }
        await this.outbox.record(
          {
            topic: 'product_review.edited',
            aggregateType: 'product_review',
            aggregateId: id,
            payload: { authorUserId: userId },
          },
          tx,
        );

        return tx.productReview.findUniqueOrThrow({ where: { id } });
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async editSellerRating(
    userId: string,
    id: string,
    dto: EditSellerRatingDto,
    idempotencyKey: string,
  ): Promise<SellerRating> {
    const requestHash = this.hashRequest({
      id,
      rating: dto.rating ?? null,
      comment: dto.comment ?? null,
    });
    const replay = await this.checkEditReplay(
      idempotencyKey,
      id,
      requestHash,
      ReviewModerationAction.EDITED,
    );
    if (replay) return this.findOwnSellerRating(userId, id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM seller_ratings WHERE id = ${id}::uuid FOR UPDATE`;
        const rating = await tx.sellerRating.findUnique({ where: { id } });
        if (!rating || rating.authorUserId !== userId) {
          throw new NotFoundException('Rating not found');
        }
        if (rating.version !== dto.version) {
          throw new ConflictException('Rating changed; reload and try again');
        }
        if (
          rating.visibility === ReviewVisibility.REMOVED ||
          rating.visibility === ReviewVisibility.WITHDRAWN
        ) {
          throw new ConflictException(
            `Cannot edit a rating with visibility ${rating.visibility}`,
          );
        }
        if (rating.editDeadline.getTime() < Date.now()) {
          throw new ConflictException('Edit window has closed');
        }

        const nextRevisionNumber =
          (await tx.sellerRatingRevision.count({
            where: { sellerRatingId: id },
          })) + 1;
        const newRating = dto.rating ?? rating.rating;
        const newComment =
          dto.comment !== undefined ? dto.comment : rating.comment;

        const result = await tx.sellerRating.updateMany({
          where: { id, version: dto.version },
          data: {
            rating: newRating,
            comment: newComment,
            moderationState: ReviewModerationState.PENDING,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) {
          throw new ConflictException('Rating changed; reload and try again');
        }

        await tx.sellerRatingRevision.create({
          data: {
            sellerRatingId: id,
            revisionNumber: nextRevisionNumber,
            rating: newRating,
            comment: newComment,
            authorUserId: userId,
            source: ReviewRevisionSource.CUSTOMER_EDIT,
          },
        });

        await tx.reviewModerationEvent.create({
          data: {
            targetType: ReviewTargetType.SELLER_RATING,
            targetId: id,
            action: ReviewModerationAction.EDITED,
            actorUserId: userId,
            previousVisibility: rating.visibility,
            resultingVisibility: rating.visibility,
            previousModerationState: rating.moderationState,
            resultingModerationState: ReviewModerationState.PENDING,
            idempotencyKey,
            requestHash,
          },
        });

        if (rating.visibility === ReviewVisibility.PUBLISHED) {
          await this.ratingAggregate.recalculateSellerSummary(
            tx,
            rating.sellerId,
          );
        }
        await this.outbox.record(
          {
            topic: 'seller_rating.edited',
            aggregateType: 'seller_rating',
            aggregateId: id,
            payload: { authorUserId: userId },
          },
          tx,
        );

        return tx.sellerRating.findUniqueOrThrow({ where: { id } });
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  // -----------------------------------------------------------------------
  // Withdrawal
  // -----------------------------------------------------------------------

  async withdrawProductReview(
    userId: string,
    id: string,
    idempotencyKey: string,
  ): Promise<ProductReview> {
    const replay = await this.checkEditReplay(
      idempotencyKey,
      id,
      null,
      ReviewModerationAction.WITHDRAWN,
    );
    if (replay) return this.findOwnProductReview(userId, id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM product_reviews WHERE id = ${id}::uuid FOR UPDATE`;
        const review = await tx.productReview.findUnique({ where: { id } });
        if (!review || review.authorUserId !== userId) {
          throw new NotFoundException('Review not found');
        }
        if (
          review.visibility === ReviewVisibility.REMOVED ||
          review.visibility === ReviewVisibility.WITHDRAWN
        ) {
          throw new ConflictException(
            `Cannot withdraw a review with visibility ${review.visibility}`,
          );
        }
        const wasPublished = review.visibility === ReviewVisibility.PUBLISHED;

        await tx.productReview.update({
          where: { id },
          data: {
            visibility: ReviewVisibility.WITHDRAWN,
            version: { increment: 1 },
          },
        });
        await tx.reviewModerationEvent.create({
          data: {
            targetType: ReviewTargetType.PRODUCT_REVIEW,
            targetId: id,
            action: ReviewModerationAction.WITHDRAWN,
            actorUserId: userId,
            previousVisibility: review.visibility,
            resultingVisibility: ReviewVisibility.WITHDRAWN,
            previousModerationState: review.moderationState,
            resultingModerationState: review.moderationState,
            idempotencyKey,
          },
        });

        if (wasPublished) {
          await this.ratingAggregate.recalculateProductSummary(
            tx,
            review.productId,
          );
        }
        await this.outbox.record(
          {
            topic: 'product_review.withdrawn',
            aggregateType: 'product_review',
            aggregateId: id,
            payload: { authorUserId: userId },
          },
          tx,
        );

        return tx.productReview.findUniqueOrThrow({ where: { id } });
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async withdrawSellerRating(
    userId: string,
    id: string,
    idempotencyKey: string,
  ): Promise<SellerRating> {
    const replay = await this.checkEditReplay(
      idempotencyKey,
      id,
      null,
      ReviewModerationAction.WITHDRAWN,
    );
    if (replay) return this.findOwnSellerRating(userId, id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM seller_ratings WHERE id = ${id}::uuid FOR UPDATE`;
        const rating = await tx.sellerRating.findUnique({ where: { id } });
        if (!rating || rating.authorUserId !== userId) {
          throw new NotFoundException('Rating not found');
        }
        if (
          rating.visibility === ReviewVisibility.REMOVED ||
          rating.visibility === ReviewVisibility.WITHDRAWN
        ) {
          throw new ConflictException(
            `Cannot withdraw a rating with visibility ${rating.visibility}`,
          );
        }
        const wasPublished = rating.visibility === ReviewVisibility.PUBLISHED;

        await tx.sellerRating.update({
          where: { id },
          data: {
            visibility: ReviewVisibility.WITHDRAWN,
            version: { increment: 1 },
          },
        });
        await tx.reviewModerationEvent.create({
          data: {
            targetType: ReviewTargetType.SELLER_RATING,
            targetId: id,
            action: ReviewModerationAction.WITHDRAWN,
            actorUserId: userId,
            previousVisibility: rating.visibility,
            resultingVisibility: ReviewVisibility.WITHDRAWN,
            previousModerationState: rating.moderationState,
            resultingModerationState: rating.moderationState,
            idempotencyKey,
          },
        });

        if (wasPublished) {
          await this.ratingAggregate.recalculateSellerSummary(
            tx,
            rating.sellerId,
          );
        }
        await this.outbox.record(
          {
            topic: 'seller_rating.withdrawn',
            aggregateType: 'seller_rating',
            aggregateId: id,
            payload: { authorUserId: userId },
          },
          tx,
        );

        return tx.sellerRating.findUniqueOrThrow({ where: { id } });
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  // -----------------------------------------------------------------------
  // Reports (submission side only — moderation/dismissal belongs to the
  // admin-moderation module)
  // -----------------------------------------------------------------------

  async reportProductReview(
    reporterUserId: string,
    id: string,
    dto: ReportReviewDto,
    idempotencyKey: string,
  ): Promise<ReviewReport> {
    this.assertReportPayload(dto);
    const requestHash = this.hashRequest({
      id,
      reason: dto.reason,
      details: dto.details ?? null,
    });
    const replay = await this.checkEditReplay(
      idempotencyKey,
      id,
      requestHash,
      ReviewModerationAction.REPORTED,
    );
    if (replay) {
      // The dedup partial-unique index guarantees at most one OPEN report
      // per (reporter, target), so this lookup is unambiguous on replay.
      const existing = await this.prisma.reviewReport.findFirst({
        where: {
          productReviewId: id,
          reporterUserId,
          status: ReviewReportStatus.OPEN,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return existing;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const review = await tx.productReview.findUnique({ where: { id } });
        // 404 rather than 409/403 — consistent with this codebase's
        // "don't disclose what you can't act on" posture: a report against
        // content that isn't publicly visible isn't actionable.
        if (!review || review.visibility !== ReviewVisibility.PUBLISHED) {
          throw new NotFoundException('Review not found');
        }
        if (review.authorUserId === reporterUserId) {
          throw new ConflictException('You cannot report your own review');
        }

        const openReportExists = await tx.reviewReport.findFirst({
          where: { productReviewId: id, status: ReviewReportStatus.OPEN },
        });
        const report = await tx.reviewReport.create({
          data: {
            productReviewId: id,
            reporterUserId,
            reason: dto.reason,
            details: dto.details,
          },
        });
        const resultingModerationState = openReportExists
          ? review.moderationState
          : ReviewModerationState.FLAGGED;
        if (!openReportExists) {
          await tx.productReview.update({
            where: { id },
            data: { moderationState: ReviewModerationState.FLAGGED },
          });
        }
        await tx.reviewModerationEvent.create({
          data: {
            targetType: ReviewTargetType.PRODUCT_REVIEW,
            targetId: id,
            action: ReviewModerationAction.REPORTED,
            actorUserId: reporterUserId,
            previousModerationState: review.moderationState,
            resultingModerationState,
            idempotencyKey,
            requestHash,
          },
        });

        return report;
      });
    } catch (error) {
      throw this.mapWriteError(
        error,
        'A report from your account is already open for this review',
      );
    }
  }

  async reportSellerRating(
    reporterUserId: string,
    id: string,
    dto: ReportReviewDto,
    idempotencyKey: string,
  ): Promise<ReviewReport> {
    this.assertReportPayload(dto);
    const requestHash = this.hashRequest({
      id,
      reason: dto.reason,
      details: dto.details ?? null,
    });
    const replay = await this.checkEditReplay(
      idempotencyKey,
      id,
      requestHash,
      ReviewModerationAction.REPORTED,
    );
    if (replay) {
      const existing = await this.prisma.reviewReport.findFirst({
        where: {
          sellerRatingId: id,
          reporterUserId,
          status: ReviewReportStatus.OPEN,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return existing;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const rating = await tx.sellerRating.findUnique({ where: { id } });
        if (!rating || rating.visibility !== ReviewVisibility.PUBLISHED) {
          throw new NotFoundException('Rating not found');
        }
        if (rating.authorUserId === reporterUserId) {
          throw new ConflictException('You cannot report your own rating');
        }

        const openReportExists = await tx.reviewReport.findFirst({
          where: { sellerRatingId: id, status: ReviewReportStatus.OPEN },
        });
        const report = await tx.reviewReport.create({
          data: {
            sellerRatingId: id,
            reporterUserId,
            reason: dto.reason,
            details: dto.details,
          },
        });
        const resultingModerationState = openReportExists
          ? rating.moderationState
          : ReviewModerationState.FLAGGED;
        if (!openReportExists) {
          await tx.sellerRating.update({
            where: { id },
            data: { moderationState: ReviewModerationState.FLAGGED },
          });
        }
        await tx.reviewModerationEvent.create({
          data: {
            targetType: ReviewTargetType.SELLER_RATING,
            targetId: id,
            action: ReviewModerationAction.REPORTED,
            actorUserId: reporterUserId,
            previousModerationState: rating.moderationState,
            resultingModerationState,
            idempotencyKey,
            requestHash,
          },
        });

        return report;
      });
    } catch (error) {
      throw this.mapWriteError(
        error,
        'A report from your account is already open for this rating',
      );
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private assertReportPayload(dto: ReportReviewDto): void {
    if (dto.reason === 'OTHER' && !dto.details?.trim()) {
      throw new ConflictException(
        'details is required when reason is OTHER',
      );
    }
  }

  private async findOwnProductReview(
    userId: string,
    id: string,
  ): Promise<ProductReview> {
    const review = await this.prisma.productReview.findUnique({
      where: { id },
    });
    if (!review || review.authorUserId !== userId) {
      throw new NotFoundException('Review not found');
    }
    return review;
  }

  private async findOwnSellerRating(
    userId: string,
    id: string,
  ): Promise<SellerRating> {
    const rating = await this.prisma.sellerRating.findUnique({
      where: { id },
    });
    if (!rating || rating.authorUserId !== userId) {
      throw new NotFoundException('Rating not found');
    }
    return rating;
  }

  /**
   * Shared replay check for every Idempotency-Key-bearing command: a
   * previously recorded ReviewModerationEvent with the same key and matching
   * target/hash/action means "return the current state unchanged"; a
   * mismatch means the key was reused for a different request.
   */
  private async checkEditReplay(
    idempotencyKey: string,
    targetId: string,
    requestHash: string | null,
    action: ReviewModerationAction,
  ): Promise<boolean> {
    const existing = await this.prisma.reviewModerationEvent.findUnique({
      where: { idempotencyKey },
    });
    if (!existing) return false;
    if (
      existing.targetId !== targetId ||
      existing.action !== action ||
      (requestHash !== null && existing.requestHash !== requestHash)
    ) {
      throw new ConflictException(
        'Idempotency-Key already used for a different request',
      );
    }
    return true;
  }

  private hashRequest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private mapWriteError(
    error: unknown,
    conflictMessage = 'Idempotency-Key already used, or a conflicting record was created concurrently',
  ): unknown {
    if (this.isPrismaError(error, 'P2002')) {
      return new ConflictException(conflictMessage);
    }
    return error;
  }

  private isPrismaError(
    error: unknown,
    code: string,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === code
    );
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
