import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ReviewModerationAction,
  ReviewModerationState,
  ReviewReportStatus,
  ReviewVisibility,
} from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { RatingAggregateService } from '../rating-aggregate.service';
import { AdminReviewsService } from './admin-reviews.service';

type Tx = {
  $queryRaw: jest.Mock;
  productReview: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    updateMany: jest.Mock;
  };
  sellerRating: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    updateMany: jest.Mock;
  };
  reviewReport: {
    updateMany: jest.Mock;
    count: jest.Mock;
    findMany: jest.Mock;
  };
  reviewModerationEvent: { create: jest.Mock; findMany: jest.Mock };
};

function buildTx(): Tx {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    productReview: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    sellerRating: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    reviewReport: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    reviewModerationEvent: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

type PrismaMock = {
  productReview: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  sellerRating: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  reviewModerationEvent: { findUnique: jest.Mock; findMany: jest.Mock };
  reviewReport: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
  $transaction: jest.Mock;
  tx: Tx;
};

function buildPrisma(): PrismaMock {
  const tx = buildTx();
  return {
    productReview: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    sellerRating: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    reviewModerationEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      // findOne() re-reads the full detail (including moderation history)
      // after every transition commits — irrelevant to what these tests
      // assert on, so it always resolves empty here.
      findMany: jest.fn().mockResolvedValue([]),
    },
    reviewReport: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    $transaction: jest.fn((arg: (client: Tx) => unknown) => arg(tx)),
    tx,
  };
}

describe('AdminReviewsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let auditService: { record: jest.Mock };
  let ratingAggregate: {
    recalculateProductSummary: jest.Mock;
    recalculateSellerSummary: jest.Mock;
  };
  let service: AdminReviewsService;

  const baseReview = {
    id: 'review-1',
    authorUserId: 'author-1',
    productId: 'product-1',
    visibility: ReviewVisibility.PUBLISHED,
    moderationState: ReviewModerationState.PENDING,
    version: 0,
  };

  beforeEach(() => {
    prisma = buildPrisma();
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    ratingAggregate = {
      recalculateProductSummary: jest.fn().mockResolvedValue({}),
      recalculateSellerSummary: jest.fn().mockResolvedValue({}),
    };
    service = new AdminReviewsService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      ratingAggregate as unknown as RatingAggregateService,
    );
  });

  // -------------------------------------------------------------------
  // approve
  // -------------------------------------------------------------------

  describe('approve', () => {
    it('sets moderationState to APPROVED without touching visibility, and does not recalculate the aggregate', async () => {
      prisma.productReview.findUnique.mockResolvedValue(baseReview);
      prisma.tx.productReview.findUniqueOrThrow.mockResolvedValue(baseReview);
      prisma.productReview.findMany = jest.fn();

      await service.approve(
        'product',
        'review-1',
        { version: 0 },
        'admin-1',
        '11111111-1111-4111-8111-111111111111',
      );

      expect(prisma.tx.productReview.updateMany).toHaveBeenCalledWith({
        where: { id: 'review-1', version: 0 },
        data: {
          moderationState: ReviewModerationState.APPROVED,
          version: { increment: 1 },
        },
      });
      expect(prisma.tx.reviewModerationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: ReviewModerationAction.APPROVED,
            reason: null,
            resultingModerationState: ReviewModerationState.APPROVED,
          }) as object,
        }) as object,
      );
      expect(auditService.record).toHaveBeenCalled();
      expect(ratingAggregate.recalculateProductSummary).not.toHaveBeenCalled();
    });

    it('dismisses every OPEN report against the target', async () => {
      prisma.productReview.findUnique.mockResolvedValue(baseReview);
      prisma.tx.productReview.findUniqueOrThrow.mockResolvedValue(baseReview);
      prisma.tx.reviewReport.updateMany.mockResolvedValue({ count: 2 });

      await service.approve(
        'product',
        'review-1',
        { version: 0 },
        'admin-1',
        '11111111-1111-4111-8111-111111111111',
      );

      expect(prisma.tx.reviewReport.updateMany).toHaveBeenCalledWith({
        where: { productReviewId: 'review-1', status: ReviewReportStatus.OPEN },
        data: expect.objectContaining({ status: ReviewReportStatus.DISMISSED }) as object,
      });
    });

    it('rejects when the actor is the record author', async () => {
      prisma.productReview.findUnique.mockResolvedValue(baseReview);

      await expect(
        service.approve(
          'product',
          'review-1',
          { version: 0 },
          'author-1',
          '11111111-1111-4111-8111-111111111111',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for a missing record', async () => {
      prisma.productReview.findUnique.mockResolvedValue(null);

      await expect(
        service.approve(
          'product',
          'missing',
          { version: 0 },
          'admin-1',
          '11111111-1111-4111-8111-111111111111',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------
  // hide / remove / restore — state machine + aggregate recalculation
  // -------------------------------------------------------------------

  describe('hide', () => {
    it('hides a PUBLISHED review, actions open reports, and recalculates the aggregate', async () => {
      prisma.productReview.findUnique.mockResolvedValue(baseReview);
      prisma.tx.productReview.findUniqueOrThrow.mockResolvedValue(baseReview);

      await service.hide(
        'product',
        'review-1',
        { version: 0, reason: 'spam' },
        'admin-1',
        '22222222-2222-4222-8222-222222222222',
      );

      expect(prisma.tx.productReview.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'review-1',
          version: 0,
          visibility: { in: [ReviewVisibility.PUBLISHED] },
        },
        data: { visibility: ReviewVisibility.HIDDEN, version: { increment: 1 } },
      });
      expect(prisma.tx.reviewReport.updateMany).toHaveBeenCalledWith({
        where: { productReviewId: 'review-1', status: ReviewReportStatus.OPEN },
        data: expect.objectContaining({ status: ReviewReportStatus.ACTIONED }) as object,
      });
      expect(ratingAggregate.recalculateProductSummary).toHaveBeenCalledWith(
        prisma.tx,
        'product-1',
      );
    });

    it('rejects hiding an already-HIDDEN record', async () => {
      prisma.productReview.findUnique.mockResolvedValue({
        ...baseReview,
        visibility: ReviewVisibility.HIDDEN,
      });

      await expect(
        service.hide(
          'product',
          'review-1',
          { version: 0, reason: 'spam' },
          'admin-1',
          '22222222-2222-4222-8222-222222222223',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a stale version with ConflictException', async () => {
      prisma.productReview.findUnique.mockResolvedValue(baseReview);
      prisma.tx.productReview.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.hide(
          'product',
          'review-1',
          { version: 0, reason: 'spam' },
          'admin-1',
          '22222222-2222-4222-8222-222222222224',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('removes from PUBLISHED or HIDDEN and recalculates the aggregate', async () => {
      prisma.sellerRating.findUnique.mockResolvedValue({
        ...baseReview,
        id: 'rating-1',
        sellerId: 'seller-1',
        productId: undefined,
        visibility: ReviewVisibility.HIDDEN,
      });
      prisma.tx.sellerRating.findUniqueOrThrow.mockResolvedValue({
        id: 'rating-1',
        sellerId: 'seller-1',
      });

      await service.remove(
        'seller',
        'rating-1',
        { version: 0, reason: 'abuse' },
        'admin-1',
        '33333333-3333-4333-8333-333333333333',
      );

      expect(prisma.tx.sellerRating.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'rating-1',
          version: 0,
          visibility: { in: [ReviewVisibility.PUBLISHED, ReviewVisibility.HIDDEN] },
        },
        data: { visibility: ReviewVisibility.REMOVED, version: { increment: 1 } },
      });
      expect(ratingAggregate.recalculateSellerSummary).toHaveBeenCalledWith(
        prisma.tx,
        'seller-1',
      );
    });

    it('rejects removing an already-REMOVED (terminal) record', async () => {
      prisma.productReview.findUnique.mockResolvedValue({
        ...baseReview,
        visibility: ReviewVisibility.REMOVED,
      });

      await expect(
        service.remove(
          'product',
          'review-1',
          { version: 0, reason: 'abuse' },
          'admin-1',
          '33333333-3333-4333-8333-333333333334',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('restore', () => {
    it('restores only from HIDDEN, setting visibility PUBLISHED and moderationState PENDING', async () => {
      prisma.productReview.findUnique.mockResolvedValue({
        ...baseReview,
        visibility: ReviewVisibility.HIDDEN,
        moderationState: ReviewModerationState.APPROVED,
      });
      prisma.tx.productReview.findUniqueOrThrow.mockResolvedValue(baseReview);

      await service.restore(
        'product',
        'review-1',
        { version: 0, reason: 'reviewed and cleared' },
        'admin-1',
        '44444444-4444-4444-8444-444444444444',
      );

      expect(prisma.tx.productReview.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'review-1',
          version: 0,
          visibility: { in: [ReviewVisibility.HIDDEN] },
        },
        data: {
          visibility: ReviewVisibility.PUBLISHED,
          moderationState: ReviewModerationState.PENDING,
          version: { increment: 1 },
        },
      });
      // Restore does not touch reports.
      expect(prisma.tx.reviewReport.updateMany).not.toHaveBeenCalled();
      expect(ratingAggregate.recalculateProductSummary).toHaveBeenCalled();
    });

    it('rejects restoring from REMOVED (terminal)', async () => {
      prisma.productReview.findUnique.mockResolvedValue({
        ...baseReview,
        visibility: ReviewVisibility.REMOVED,
      });

      await expect(
        service.restore(
          'product',
          'review-1',
          { version: 0, reason: 'x' },
          'admin-1',
          '44444444-4444-4444-8444-444444444445',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects restoring from PUBLISHED', async () => {
      prisma.productReview.findUnique.mockResolvedValue(baseReview);

      await expect(
        service.restore(
          'product',
          'review-1',
          { version: 0, reason: 'x' },
          'admin-1',
          '44444444-4444-4444-8444-444444444446',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -------------------------------------------------------------------
  // idempotency replay
  // -------------------------------------------------------------------

  describe('idempotency', () => {
    it('replays a repeated key with the same payload without re-applying the transition', async () => {
      prisma.productReview.findUnique.mockResolvedValue(baseReview);

      // First call computes and stores the real hash via the mock's create;
      // capture it, then simulate a replay using that same hash.
      prisma.reviewModerationEvent.findUnique.mockResolvedValueOnce(null);
      await service.approve(
        'product',
        'review-1',
        { version: 0 },
        'admin-1',
        '55555555-5555-4555-8555-555555555555',
      );
      const createdCall = prisma.tx.reviewModerationEvent.create.mock.calls[0] as [
        { data: { requestHash: string } },
      ];
      const storedHash = createdCall[0].data.requestHash;

      prisma.reviewModerationEvent.findUnique.mockResolvedValue({
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
        requestHash: storedHash,
      });
      prisma.tx.productReview.updateMany.mockClear();

      await service.approve(
        'product',
        'review-1',
        { version: 0 },
        'admin-1',
        '55555555-5555-4555-8555-555555555555',
      );

      // The transition itself is not re-applied on replay.
      expect(prisma.tx.productReview.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a reused key with a different payload with ConflictException', async () => {
      prisma.productReview.findUnique.mockResolvedValue(baseReview);
      prisma.reviewModerationEvent.findUnique.mockResolvedValue({
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
        requestHash: 'a-different-hash',
      });

      await expect(
        service.approve(
          'product',
          'review-1',
          { version: 0 },
          'admin-1',
          '66666666-6666-4666-8666-666666666666',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -------------------------------------------------------------------
  // dismissReport — FLAGGED-reversion rule
  // -------------------------------------------------------------------

  describe('dismissReport', () => {
    const flaggedReview = {
      ...baseReview,
      moderationState: ReviewModerationState.FLAGGED,
    };

    it('reverts moderationState to PENDING when no APPROVED action preceded the flagging report', async () => {
      prisma.reviewReport.findUnique.mockResolvedValue({
        id: 'report-1',
        productReviewId: 'review-1',
        sellerRatingId: null,
      });
      prisma.reviewReport.findUniqueOrThrow.mockResolvedValue({ id: 'report-1' });
      prisma.productReview.findUnique.mockResolvedValue(flaggedReview);
      prisma.tx.reviewReport.updateMany.mockResolvedValue({ count: 1 });
      prisma.tx.reviewReport.count.mockResolvedValue(0);
      prisma.tx.reviewModerationEvent.findMany.mockResolvedValue([
        {
          action: ReviewModerationAction.REPORTED,
          createdAt: new Date('2026-01-02'),
        },
        {
          action: ReviewModerationAction.SUBMITTED,
          createdAt: new Date('2026-01-01'),
        },
      ]);

      await service.dismissReport(
        'report-1',
        { reason: 'not valid' },
        'admin-1',
        '77777777-7777-4777-8777-777777777777',
      );

      expect(prisma.tx.productReview.updateMany).toHaveBeenCalledWith({
        where: { id: 'review-1', version: 0 },
        data: { moderationState: ReviewModerationState.PENDING, version: { increment: 1 } },
      });
    });

    it('reverts moderationState to APPROVED when the last decision before the flagging report was APPROVED', async () => {
      prisma.reviewReport.findUnique.mockResolvedValue({
        id: 'report-2',
        productReviewId: 'review-1',
        sellerRatingId: null,
      });
      prisma.reviewReport.findUniqueOrThrow.mockResolvedValue({ id: 'report-2' });
      prisma.productReview.findUnique.mockResolvedValue(flaggedReview);
      prisma.tx.reviewReport.updateMany.mockResolvedValue({ count: 1 });
      prisma.tx.reviewReport.count.mockResolvedValue(0);
      prisma.tx.reviewModerationEvent.findMany.mockResolvedValue([
        {
          action: ReviewModerationAction.REPORTED,
          createdAt: new Date('2026-01-03'),
        },
        {
          action: ReviewModerationAction.APPROVED,
          createdAt: new Date('2026-01-02'),
        },
        {
          action: ReviewModerationAction.SUBMITTED,
          createdAt: new Date('2026-01-01'),
        },
      ]);

      await service.dismissReport(
        'report-2',
        { reason: 'not valid' },
        'admin-1',
        '88888888-8888-4888-8888-888888888888',
      );

      expect(prisma.tx.productReview.updateMany).toHaveBeenCalledWith({
        where: { id: 'review-1', version: 0 },
        data: { moderationState: ReviewModerationState.APPROVED, version: { increment: 1 } },
      });
    });

    it('does not touch moderationState when other OPEN reports remain', async () => {
      prisma.reviewReport.findUnique.mockResolvedValue({
        id: 'report-3',
        productReviewId: 'review-1',
        sellerRatingId: null,
      });
      prisma.reviewReport.findUniqueOrThrow.mockResolvedValue({ id: 'report-3' });
      prisma.productReview.findUnique.mockResolvedValue(flaggedReview);
      prisma.tx.reviewReport.updateMany.mockResolvedValue({ count: 1 });
      prisma.tx.reviewReport.count.mockResolvedValue(1);

      await service.dismissReport(
        'report-3',
        { reason: 'not valid' },
        'admin-1',
        '99999999-9999-4999-8999-999999999999',
      );

      expect(prisma.tx.productReview.updateMany).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the report is no longer OPEN', async () => {
      prisma.reviewReport.findUnique.mockResolvedValue({
        id: 'report-4',
        productReviewId: 'review-1',
        sellerRatingId: null,
      });
      prisma.productReview.findUnique.mockResolvedValue(flaggedReview);
      prisma.tx.reviewReport.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.dismissReport(
          'report-4',
          { reason: 'not valid' },
          'admin-1',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when the actor authored the underlying review', async () => {
      prisma.reviewReport.findUnique.mockResolvedValue({
        id: 'report-5',
        productReviewId: 'review-1',
        sellerRatingId: null,
      });
      prisma.productReview.findUnique.mockResolvedValue(flaggedReview);

      await expect(
        service.dismissReport(
          'report-5',
          { reason: 'not valid' },
          'author-1',
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
