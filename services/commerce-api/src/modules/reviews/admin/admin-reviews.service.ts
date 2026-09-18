import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  Prisma,
  ReviewModerationAction,
  ReviewModerationState,
  ReviewReportStatus,
  ReviewTargetType,
  ReviewVisibility,
  type ReviewModerationEvent,
} from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from '../../../common/pagination/pagination-query.dto';
// Frozen contract this module depends on (recalculateProductSummary /
// recalculateSellerSummary) — owned by the customer-facing reviews module,
// exported via ReviewsModule and injected here through AdminReviewsModule's
// import of it (see admin-reviews.module.ts).
import { RatingAggregateService } from '../rating-aggregate.service';
import { ApproveModerationDto } from './dto/approve-moderation.dto';
import { DismissReportDto } from './dto/dismiss-report.dto';
import { AdminReviewType, ListAdminReviewsDto } from './dto/list-admin-reviews.dto';
import { ModerationActionDto } from './dto/moderation-action.dto';
import {
  AdminReviewDetail,
  AdminReviewListItem,
  AdminReviewPage,
  AdminReviewReportDismissal,
  AdminReviewTargetParam,
  ModeratableRecord,
  PRODUCT_REVIEW_DETAIL_INCLUDE,
  PRODUCT_REVIEW_LIST_INCLUDE,
  SELLER_RATING_DETAIL_INCLUDE,
  SELLER_RATING_LIST_INCLUDE,
} from './admin-reviews.types';

function toReviewTargetType(type: AdminReviewTargetParam): ReviewTargetType {
  return type === 'product'
    ? ReviewTargetType.PRODUCT_REVIEW
    : ReviewTargetType.SELLER_RATING;
}

/** Narrows a raw `:type` URL segment to `'product' | 'seller'`, used by the
 * controller before it can call any service method that takes
 * AdminReviewTargetParam. */
export function assertAdminReviewType(
  type: string,
): asserts type is AdminReviewTargetParam {
  if (type !== 'product' && type !== 'seller') {
    throw new BadRequestException(
      "type must be 'product' or 'seller'",
    );
  }
}

/** Every hide/remove/restore accepts a `reason` and dispositions any
 * currently-OPEN reports against the target the same way; this bundles the
 * per-transition configuration `transitionVisibility` needs. */
type VisibilityTransitionOptions = {
  action: ReviewModerationAction;
  allowedFrom: ReviewVisibility[];
  resultingVisibility: ReviewVisibility;
  resultingModerationState?: ReviewModerationState;
  /** Status every currently-OPEN report against the target is moved to, or
   * null to leave reports untouched (restore has no reports left to touch
   * once report-dismissal already reverted moderationState — see dismissReport). */
  reportDisposition: ReviewReportStatus | null;
  recalculateAggregate: boolean;
};

@Injectable()
export class AdminReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly ratingAggregateService: RatingAggregateService,
  ) {}

  // ---------------------------------------------------------------------
  // Queue / detail reads
  // ---------------------------------------------------------------------

  /**
   * A single unified, paginated, sorted (by createdAt desc) queue across the
   * two underlying tables, each row tagged with a `type` discriminator.
   * Since ProductReview and SellerRating are separate tables, this fetches
   * the top (page * limit) rows from each — sorted the same way the merged
   * result is — which is sufficient for a correct top-K merge: any row that
   * belongs in the requested page must appear within the top (page * limit)
   * of its own source table. This re-fetches a growing prefix on each page
   * rather than tracking a cursor, which is the right trade-off for an admin
   * queue (bounded, infrequent, correctness-over-throughput) — not something
   * to reuse for a high-traffic customer-facing list.
   */
  async list(query: ListAdminReviewsDto): Promise<AdminReviewPage> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const windowSize = page * limit;

    const wantsProduct = !query.type || query.type === AdminReviewType.PRODUCT;
    // productId has no meaning against SellerRating — a productId filter
    // combined with type=seller (or no type) simply yields no seller rows.
    const wantsSeller =
      (!query.type || query.type === AdminReviewType.SELLER) && !query.productId;

    const dateWhere = (
      from: string | undefined,
      to: string | undefined,
    ): Prisma.DateTimeFilter | undefined =>
      from || to
        ? {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          }
        : undefined;

    const createdAtFilter = dateWhere(query.createdFrom, query.createdTo);
    const updatedAtFilter = dateWhere(query.updatedFrom, query.updatedTo);
    const reportFilter =
      query.hasOpenReport === undefined
        ? {}
        : query.hasOpenReport
          ? { ReviewReport: { some: { status: ReviewReportStatus.OPEN } } }
          : { ReviewReport: { none: { status: ReviewReportStatus.OPEN } } };

    const productWhere: Prisma.ProductReviewWhereInput = {
      ...(query.moderationState ? { moderationState: query.moderationState } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.sellerId ? { sellerId: query.sellerId } : {}),
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(updatedAtFilter ? { updatedAt: updatedAtFilter } : {}),
      ...reportFilter,
    };
    const sellerWhere: Prisma.SellerRatingWhereInput = {
      ...(query.moderationState ? { moderationState: query.moderationState } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.sellerId ? { sellerId: query.sellerId } : {}),
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(updatedAtFilter ? { updatedAt: updatedAtFilter } : {}),
      ...reportFilter,
    };

    const [productRows, productTotal] = wantsProduct
      ? await Promise.all([
          this.prisma.productReview.findMany({
            where: productWhere,
            include: PRODUCT_REVIEW_LIST_INCLUDE,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: windowSize,
          }),
          this.prisma.productReview.count({ where: productWhere }),
        ])
      : [[], 0];

    const [sellerRows, sellerTotal] = wantsSeller
      ? await Promise.all([
          this.prisma.sellerRating.findMany({
            where: sellerWhere,
            include: SELLER_RATING_LIST_INCLUDE,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: windowSize,
          }),
          this.prisma.sellerRating.count({ where: sellerWhere }),
        ])
      : [[], 0];

    const merged: AdminReviewListItem[] = [
      ...productRows.map((row) => ({ type: 'product' as const, ...row })),
      ...sellerRows.map((row) => ({ type: 'seller' as const, ...row })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const start = (page - 1) * limit;
    const items = merged.slice(start, start + limit);

    return { items, total: productTotal + sellerTotal, page, limit };
  }

  async findOne(
    type: AdminReviewTargetParam,
    id: string,
  ): Promise<AdminReviewDetail> {
    if (type === 'product') {
      const record = await this.prisma.productReview.findUnique({
        where: { id },
        include: PRODUCT_REVIEW_DETAIL_INCLUDE,
      });
      if (!record) throw new NotFoundException('Product review not found');
      const moderationEvents = await this.loadModerationEvents(
        ReviewTargetType.PRODUCT_REVIEW,
        id,
      );
      return { type: 'product', ...record, moderationEvents };
    }
    const record = await this.prisma.sellerRating.findUnique({
      where: { id },
      include: SELLER_RATING_DETAIL_INCLUDE,
    });
    if (!record) throw new NotFoundException('Seller rating not found');
    const moderationEvents = await this.loadModerationEvents(
      ReviewTargetType.SELLER_RATING,
      id,
    );
    return { type: 'seller', ...record, moderationEvents };
  }

  private loadModerationEvents(
    targetType: ReviewTargetType,
    targetId: string,
  ): Promise<ReviewModerationEvent[]> {
    return this.prisma.reviewModerationEvent.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------
  // Moderation transitions
  // ---------------------------------------------------------------------

  async approve(
    type: AdminReviewTargetParam,
    id: string,
    dto: ApproveModerationDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<AdminReviewDetail> {
    const targetType = toReviewTargetType(type);
    const requestHash = this.hashRequest({
      type,
      id,
      action: 'approve',
      version: dto.version,
    });
    if (await this.isReplay(idempotencyKey, requestHash)) {
      return this.findOne(type, id);
    }

    const current = await this.loadCurrent(type, id);
    this.assertNotAuthor(actorUserId, current.authorUserId);
    // Approving a terminal record (REMOVED/WITHDRAWN) makes no sense — those
    // states are final and no further moderation decision applies to them.
    if (
      current.visibility === ReviewVisibility.REMOVED ||
      current.visibility === ReviewVisibility.WITHDRAWN
    ) {
      throw new ConflictException(
        `Cannot approve a record with visibility ${current.visibility}`,
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockRow(tx, type, id);
        const result = await this.updateRecord(tx, type, id, dto.version, {
          moderationState: ReviewModerationState.APPROVED,
        });
        if (result.count !== 1) {
          throw new ConflictException('Record changed; reload and try again');
        }

        const reportsAffected = await this.resolveOpenReports(
          tx,
          targetType,
          id,
          actorUserId,
          'Dismissed automatically: the underlying content was approved',
          ReviewReportStatus.DISMISSED,
        );

        await tx.reviewModerationEvent.create({
          data: {
            targetType,
            targetId: id,
            action: ReviewModerationAction.APPROVED,
            actorUserId,
            reason: null,
            previousVisibility: current.visibility,
            resultingVisibility: current.visibility,
            previousModerationState: current.moderationState,
            resultingModerationState: ReviewModerationState.APPROVED,
            idempotencyKey,
            requestHash,
          },
        });

        await this.auditService.record(
          {
            actorUserId,
            action: 'reviews.moderation.approved',
            targetType,
            targetId: id,
            metadata: { type, reportsAffected },
          },
          tx,
        );
        // No aggregate recalculation: visibility does not change on approve.
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }

    return this.findOne(type, id);
  }

  async hide(
    type: AdminReviewTargetParam,
    id: string,
    dto: ModerationActionDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<AdminReviewDetail> {
    return this.transitionVisibility(type, id, dto, actorUserId, idempotencyKey, {
      action: ReviewModerationAction.HIDDEN,
      allowedFrom: [ReviewVisibility.PUBLISHED],
      resultingVisibility: ReviewVisibility.HIDDEN,
      reportDisposition: ReviewReportStatus.ACTIONED,
      recalculateAggregate: true,
    });
  }

  async remove(
    type: AdminReviewTargetParam,
    id: string,
    dto: ModerationActionDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<AdminReviewDetail> {
    return this.transitionVisibility(type, id, dto, actorUserId, idempotencyKey, {
      action: ReviewModerationAction.REMOVED,
      allowedFrom: [ReviewVisibility.PUBLISHED, ReviewVisibility.HIDDEN],
      resultingVisibility: ReviewVisibility.REMOVED,
      reportDisposition: ReviewReportStatus.ACTIONED,
      recalculateAggregate: true,
    });
  }

  async restore(
    type: AdminReviewTargetParam,
    id: string,
    dto: ModerationActionDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<AdminReviewDetail> {
    return this.transitionVisibility(type, id, dto, actorUserId, idempotencyKey, {
      action: ReviewModerationAction.RESTORED,
      allowedFrom: [ReviewVisibility.HIDDEN],
      resultingVisibility: ReviewVisibility.PUBLISHED,
      resultingModerationState: ReviewModerationState.PENDING,
      reportDisposition: null,
      recalculateAggregate: true,
    });
  }

  private async transitionVisibility(
    type: AdminReviewTargetParam,
    id: string,
    dto: ModerationActionDto,
    actorUserId: string,
    idempotencyKey: string,
    opts: VisibilityTransitionOptions,
  ): Promise<AdminReviewDetail> {
    const targetType = toReviewTargetType(type);
    const requestHash = this.hashRequest({
      type,
      id,
      action: opts.action,
      version: dto.version,
      reason: dto.reason,
    });
    if (await this.isReplay(idempotencyKey, requestHash)) {
      return this.findOne(type, id);
    }

    const current = await this.loadCurrent(type, id);
    this.assertNotAuthor(actorUserId, current.authorUserId);
    if (!opts.allowedFrom.includes(current.visibility)) {
      throw new ConflictException(
        `Cannot ${opts.action.toLowerCase()} a record with visibility ${current.visibility}`,
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockRow(tx, type, id);
        const data: {
          visibility?: ReviewVisibility;
          moderationState?: ReviewModerationState;
        } = {
          visibility: opts.resultingVisibility,
          ...(opts.resultingModerationState
            ? { moderationState: opts.resultingModerationState }
            : {}),
        };
        const result = await this.updateRecord(
          tx,
          type,
          id,
          dto.version,
          data,
          opts.allowedFrom,
        );
        if (result.count !== 1) {
          throw new ConflictException('Record changed; reload and try again');
        }

        let reportsAffected = 0;
        if (opts.reportDisposition) {
          reportsAffected = await this.resolveOpenReports(
            tx,
            targetType,
            id,
            actorUserId,
            dto.reason,
            opts.reportDisposition,
          );
        }

        await tx.reviewModerationEvent.create({
          data: {
            targetType,
            targetId: id,
            action: opts.action,
            actorUserId,
            reason: dto.reason,
            previousVisibility: current.visibility,
            resultingVisibility: opts.resultingVisibility,
            previousModerationState: current.moderationState,
            resultingModerationState:
              opts.resultingModerationState ?? current.moderationState,
            idempotencyKey,
            requestHash,
          },
        });

        await this.auditService.record(
          {
            actorUserId,
            action: `reviews.moderation.${opts.action.toLowerCase()}`,
            targetType,
            targetId: id,
            metadata: { type, reason: dto.reason, reportsAffected },
          },
          tx,
        );

        if (opts.recalculateAggregate) {
          await this.recalculateAggregateFor(tx, type, id);
        }
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }

    return this.findOne(type, id);
  }

  /**
   * Report-dismissal rule for reverting a FLAGGED moderationState once no
   * OPEN reports remain against the target: this is the one place the
   * ticket leaves genuinely ambiguous ("prior state" isn't tracked as a
   * single field). The rule implemented here — walk this target's own
   * ReviewModerationEvent history, most-recent-first, starting just before
   * the REPORTED event that most recently caused the FLAGGED state; the
   * first APPROVED action found (with no EDITED/SUBMITTED action any more
   * recent than it) reverts moderationState to APPROVED, otherwise it
   * reverts to PENDING. This directly encodes "revert to APPROVED if the
   * target's last moderation event before the flagging report was an
   * APPROVED action with no edit in between, otherwise PENDING".
   */
  async dismissReport(
    reportId: string,
    dto: DismissReportDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<AdminReviewReportDismissal> {
    const report = await this.prisma.reviewReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Review report not found');

    const targetType = report.productReviewId
      ? ReviewTargetType.PRODUCT_REVIEW
      : ReviewTargetType.SELLER_RATING;
    const targetId = report.productReviewId ?? report.sellerRatingId;
    if (!targetId) {
      // XOR is enforced by a DB CHECK constraint; this branch should be
      // unreachable, but guards against a malformed row regardless.
      throw new ConflictException('Report has no target');
    }
    const type: AdminReviewTargetParam =
      targetType === ReviewTargetType.PRODUCT_REVIEW ? 'product' : 'seller';

    const requestHash = this.hashRequest({
      reportId,
      reason: dto.reason,
      action: 'dismiss-report',
    });
    if (await this.isReplay(idempotencyKey, requestHash)) {
      return { report: await this.reloadReport(reportId), target: await this.findOne(type, targetId) };
    }

    const current = await this.loadCurrent(type, targetId);
    this.assertNotAuthor(actorUserId, current.authorUserId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockRow(tx, type, targetId);
        await tx.$queryRaw`SELECT id FROM review_reports WHERE id = ${reportId}::uuid FOR UPDATE`;

        const reportUpdate = await tx.reviewReport.updateMany({
          where: { id: reportId, status: ReviewReportStatus.OPEN },
          data: {
            status: ReviewReportStatus.DISMISSED,
            resolvedByUserId: actorUserId,
            resolvedAt: new Date(),
            resolutionNote: dto.reason,
          },
        });
        if (reportUpdate.count !== 1) {
          throw new ConflictException('Report changed; reload and try again');
        }

        const remainingOpen = await tx.reviewReport.count({
          where: this.reportTargetWhere(targetType, targetId, ReviewReportStatus.OPEN),
        });

        let resultingModerationState = current.moderationState;
        if (
          remainingOpen === 0 &&
          current.moderationState === ReviewModerationState.FLAGGED
        ) {
          const events = await tx.reviewModerationEvent.findMany({
            where: { targetType, targetId },
            orderBy: { createdAt: 'desc' },
          });
          resultingModerationState = this.inferPriorModerationState(events);
          const updateResult = await this.updateRecord(
            tx,
            type,
            targetId,
            current.version,
            { moderationState: resultingModerationState },
          );
          if (updateResult.count !== 1) {
            throw new ConflictException(
              'Record changed; reload and try again',
            );
          }
        }

        await tx.reviewModerationEvent.create({
          data: {
            targetType,
            targetId,
            action: ReviewModerationAction.REPORT_DISMISSED,
            actorUserId,
            reason: dto.reason,
            previousVisibility: current.visibility,
            resultingVisibility: current.visibility,
            previousModerationState: current.moderationState,
            resultingModerationState,
            idempotencyKey,
            requestHash,
          },
        });

        await this.auditService.record(
          {
            actorUserId,
            action: 'reviews.moderation.report_dismissed',
            targetType,
            targetId,
            metadata: { reportId, reason: dto.reason, resultingModerationState },
          },
          tx,
        );
        // No aggregate recalculation: dismissing a report never changes visibility.
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }

    return {
      report: await this.reloadReport(reportId),
      target: await this.findOne(type, targetId),
    };
  }

  /** See dismissReport's doc comment for the rule this encodes. */
  private inferPriorModerationState(
    events: ReviewModerationEvent[],
  ): ReviewModerationState {
    const reportedIndex = events.findIndex(
      (event) => event.action === ReviewModerationAction.REPORTED,
    );
    const priorEvents =
      reportedIndex === -1 ? events : events.slice(reportedIndex + 1);
    for (const event of priorEvents) {
      if (event.action === ReviewModerationAction.APPROVED) {
        return ReviewModerationState.APPROVED;
      }
      if (
        event.action === ReviewModerationAction.EDITED ||
        event.action === ReviewModerationAction.SUBMITTED
      ) {
        return ReviewModerationState.PENDING;
      }
    }
    return ReviewModerationState.PENDING;
  }

  private reloadReport(
    reportId: string,
  ): Promise<Prisma.ReviewReportGetPayload<object>> {
    return this.prisma.reviewReport.findUniqueOrThrow({
      where: { id: reportId },
    });
  }

  private reportTargetWhere(
    targetType: ReviewTargetType,
    targetId: string,
    status: ReviewReportStatus,
  ): Prisma.ReviewReportWhereInput {
    return targetType === ReviewTargetType.PRODUCT_REVIEW
      ? { productReviewId: targetId, status }
      : { sellerRatingId: targetId, status };
  }

  private async resolveOpenReports(
    tx: Prisma.TransactionClient,
    targetType: ReviewTargetType,
    targetId: string,
    actorUserId: string,
    resolutionNote: string,
    status: ReviewReportStatus,
  ): Promise<number> {
    const result = await tx.reviewReport.updateMany({
      where: this.reportTargetWhere(
        targetType,
        targetId,
        ReviewReportStatus.OPEN,
      ),
      data: {
        status,
        resolvedByUserId: actorUserId,
        resolvedAt: new Date(),
        resolutionNote,
      },
    });
    return result.count;
  }

  private async recalculateAggregateFor(
    tx: Prisma.TransactionClient,
    type: AdminReviewTargetParam,
    id: string,
  ): Promise<void> {
    if (type === 'product') {
      const review = await tx.productReview.findUniqueOrThrow({
        where: { id },
      });
      await this.ratingAggregateService.recalculateProductSummary(
        tx,
        review.productId,
      );
    } else {
      const rating = await tx.sellerRating.findUniqueOrThrow({
        where: { id },
      });
      await this.ratingAggregateService.recalculateSellerSummary(
        tx,
        rating.sellerId,
      );
    }
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async loadCurrent(
    type: AdminReviewTargetParam,
    id: string,
  ): Promise<ModeratableRecord> {
    if (type === 'product') {
      const record = await this.prisma.productReview.findUnique({
        where: { id },
      });
      if (!record) throw new NotFoundException('Product review not found');
      return record;
    }
    const record = await this.prisma.sellerRating.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Seller rating not found');
    return record;
  }

  /** Row-locks the target ahead of an update in the same transaction — same
   * convention as PurchaseOrdersService.lockRow / ReturnsService's raw
   * `FOR UPDATE` queries. */
  private async lockRow(
    tx: Prisma.TransactionClient,
    type: AdminReviewTargetParam,
    id: string,
  ): Promise<void> {
    if (type === 'product') {
      await tx.$queryRaw`SELECT id FROM product_reviews WHERE id = ${id}::uuid FOR UPDATE`;
    } else {
      await tx.$queryRaw`SELECT id FROM seller_ratings WHERE id = ${id}::uuid FOR UPDATE`;
    }
  }

  private updateRecord(
    tx: Prisma.TransactionClient,
    type: AdminReviewTargetParam,
    id: string,
    version: number,
    data: {
      visibility?: ReviewVisibility;
      moderationState?: ReviewModerationState;
    },
    visibilityIn?: ReviewVisibility[],
  ): Prisma.PrismaPromise<Prisma.BatchPayload> {
    const versionedData = { ...data, version: { increment: 1 } };
    if (type === 'product') {
      return tx.productReview.updateMany({
        where: {
          id,
          version,
          ...(visibilityIn ? { visibility: { in: visibilityIn } } : {}),
        },
        data: versionedData,
      });
    }
    return tx.sellerRating.updateMany({
      where: {
        id,
        version,
        ...(visibilityIn ? { visibility: { in: visibilityIn } } : {}),
      },
      data: versionedData,
    });
  }

  private assertNotAuthor(actorUserId: string, authorUserId: string): void {
    if (actorUserId === authorUserId) {
      throw new ForbiddenException(
        'An administrator cannot moderate their own review or rating',
      );
    }
  }

  private async isReplay(
    idempotencyKey: string,
    requestHash: string,
  ): Promise<boolean> {
    const existing = await this.prisma.reviewModerationEvent.findUnique({
      where: { idempotencyKey },
    });
    if (!existing) return false;
    if (existing.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency-Key already used for a different request',
      );
    }
    return true;
  }

  private hashRequest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private mapWriteError(error: unknown): unknown {
    if (this.isPrismaError(error, 'P2002')) {
      return new ConflictException(
        'Idempotency-Key already used, or a conflicting change was made concurrently',
      );
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
