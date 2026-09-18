import { ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../database/prisma.service';
import { OutboxService } from '../../infrastructure/jobs/outbox.service';
import { RatingAggregateService } from './rating-aggregate.service';
import { ReviewEligibilityService } from './review-eligibility.service';
import { ReviewsService } from './reviews.service';

type Tx = {
  $queryRaw: jest.Mock;
  productReview: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    updateMany: jest.Mock;
    update: jest.Mock;
  };
  productReviewRevision: { create: jest.Mock; count: jest.Mock };
  sellerRating: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    updateMany: jest.Mock;
    update: jest.Mock;
  };
  sellerRatingRevision: { create: jest.Mock; count: jest.Mock };
  reviewModerationEvent: { create: jest.Mock };
  reviewReport: { findFirst: jest.Mock; create: jest.Mock };
};

function buildTx(): Tx {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    productReview: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    productReviewRevision: { create: jest.fn(), count: jest.fn().mockResolvedValue(1) },
    sellerRating: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    sellerRatingRevision: { create: jest.fn(), count: jest.fn().mockResolvedValue(1) },
    reviewModerationEvent: { create: jest.fn().mockResolvedValue({}) },
    reviewReport: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
  };
}

function buildPrisma(): {
  productReview: { findMany: jest.Mock; findUnique: jest.Mock };
  sellerRating: { findMany: jest.Mock; findUnique: jest.Mock };
  reviewModerationEvent: { findUnique: jest.Mock };
  reviewReport: { findFirst: jest.Mock };
  $transaction: jest.Mock;
  tx: Tx;
} {
  const tx = buildTx();
  return {
    productReview: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    sellerRating: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    reviewModerationEvent: { findUnique: jest.fn().mockResolvedValue(null) },
    reviewReport: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((arg: (client: Tx) => unknown) => arg(tx)),
    tx,
  };
}

describe('ReviewsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let eligibility: {
    computeProductEligibilityForSubmission: jest.Mock;
    computeSellerEligibilityForSubmission: jest.Mock;
    getOrderEligibility: jest.Mock;
  };
  let ratingAggregate: {
    recalculateProductSummary: jest.Mock;
    recalculateSellerSummary: jest.Mock;
  };
  let outbox: { record: jest.Mock };
  let service: ReviewsService;

  const orderItem = {
    id: 'item-1',
    offerId: 'offer-1',
    review: null as unknown,
    offer: {
      sellerId: 'seller-1',
      variant: { id: 'variant-1', product: { id: 'product-1' } },
    },
  };
  const eligibleCoverage = {
    eligible: true,
    requiredQuantity: 1,
    deliveredQuantity: 1,
    lastDeliveredAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = buildPrisma();
    eligibility = {
      computeProductEligibilityForSubmission: jest.fn(),
      computeSellerEligibilityForSubmission: jest.fn(),
      getOrderEligibility: jest.fn(),
    };
    ratingAggregate = {
      recalculateProductSummary: jest.fn().mockResolvedValue({}),
      recalculateSellerSummary: jest.fn().mockResolvedValue({}),
    };
    outbox = { record: jest.fn().mockResolvedValue({}) };
    service = new ReviewsService(
      prisma as unknown as PrismaService,
      eligibility as unknown as ReviewEligibilityService,
      ratingAggregate as unknown as RatingAggregateService,
      outbox as unknown as OutboxService,
    );
  });

  describe('submitProductReview', () => {
    it('creates the review, a revision, a moderation event, and recalculates the aggregate', async () => {
      eligibility.computeProductEligibilityForSubmission.mockResolvedValue({
        orderItem,
        coverage: eligibleCoverage,
      });
      prisma.tx.productReview.create.mockResolvedValue({
        id: 'review-1',
        orderItemId: 'item-1',
        productId: 'product-1',
        sellerId: 'seller-1',
        rating: 5,
        title: 'Great',
        body: '1234567890',
      });

      await service.submitProductReview('user-1', {
        orderItemId: 'item-1',
        rating: 5,
        title: 'Great',
        body: '1234567890',
      });

      expect(prisma.tx.productReview.create).toHaveBeenCalled();
      expect(prisma.tx.productReviewRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revisionNumber: 1, source: 'SUBMISSION' }) as object }),
      );
      expect(prisma.tx.reviewModerationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SUBMITTED', resultingVisibility: 'PUBLISHED' }) as object,
        }),
      );
      expect(ratingAggregate.recalculateProductSummary).toHaveBeenCalledWith(
        prisma.tx,
        'product-1',
      );
      expect(outbox.record).toHaveBeenCalled();
    });

    it('rejects a duplicate submission when the order item already has a review', async () => {
      eligibility.computeProductEligibilityForSubmission.mockResolvedValue({
        orderItem: { ...orderItem, review: { id: 'existing' } },
        coverage: eligibleCoverage,
      });

      await expect(
        service.submitProductReview('user-1', {
          orderItemId: 'item-1',
          rating: 5,
          body: '1234567890',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.tx.productReview.create).not.toHaveBeenCalled();
    });

    it('rejects submission when the item is not delivery-eligible', async () => {
      eligibility.computeProductEligibilityForSubmission.mockResolvedValue({
        orderItem,
        coverage: { ...eligibleCoverage, eligible: false, reason: 'Item has not been fully delivered' },
      });

      await expect(
        service.submitProductReview('user-1', {
          orderItemId: 'item-1',
          rating: 5,
          body: '1234567890',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('translates a concurrent unique-constraint violation into a ConflictException', async () => {
      eligibility.computeProductEligibilityForSubmission.mockResolvedValue({
        orderItem,
        coverage: eligibleCoverage,
      });
      prisma.tx.productReview.create.mockRejectedValue(
        Object.assign(new Error('unique violation'), { code: 'P2002' }),
      );

      await expect(
        service.submitProductReview('user-1', {
          orderItemId: 'item-1',
          rating: 5,
          body: '1234567890',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('submitSellerRating', () => {
    const sellerOrder = { id: 'so-1', sellerId: 'seller-1', rating: null as unknown };

    it('rejects rating your own seller account', async () => {
      eligibility.computeSellerEligibilityForSubmission.mockResolvedValue({
        sellerOrder,
        coverage: eligibleCoverage,
        isOwnSeller: true,
      });

      await expect(
        service.submitSellerRating('user-1', { sellerOrderId: 'so-1', rating: 5 }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.tx.sellerRating.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate rating for the same seller order', async () => {
      eligibility.computeSellerEligibilityForSubmission.mockResolvedValue({
        sellerOrder: { ...sellerOrder, rating: { id: 'existing' } },
        coverage: eligibleCoverage,
        isOwnSeller: false,
      });

      await expect(
        service.submitSellerRating('user-1', { sellerOrderId: 'so-1', rating: 5 }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates the rating and recalculates the seller summary on success', async () => {
      eligibility.computeSellerEligibilityForSubmission.mockResolvedValue({
        sellerOrder,
        coverage: eligibleCoverage,
        isOwnSeller: false,
      });
      prisma.tx.sellerRating.create.mockResolvedValue({
        id: 'rating-1',
        sellerOrderId: 'so-1',
        sellerId: 'seller-1',
        rating: 4,
      });

      await service.submitSellerRating('user-1', { sellerOrderId: 'so-1', rating: 4 });

      expect(ratingAggregate.recalculateSellerSummary).toHaveBeenCalledWith(
        prisma.tx,
        'seller-1',
      );
    });
  });

  describe('editProductReview', () => {
    const baseReview = {
      id: 'review-1',
      authorUserId: 'user-1',
      version: 0,
      visibility: 'PUBLISHED',
      moderationState: 'APPROVED',
      editDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      rating: 4,
      title: 'Old',
      body: '1234567890',
      productId: 'product-1',
    };

    it('rejects a stale version before checking the deadline or terminal state', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue({
        ...baseReview,
        version: 1,
        editDeadline: new Date(Date.now() - 1000), // already expired, but version should be reported first
      });

      await expect(
        service.editProductReview(
          'user-1',
          'review-1',
          { version: 0, rating: 5 },
          '11111111-1111-4111-8111-111111111111',
        ),
      ).rejects.toThrow('Review changed; reload and try again');
    });

    it('rejects editing a WITHDRAWN review', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue({
        ...baseReview,
        visibility: 'WITHDRAWN',
      });

      await expect(
        service.editProductReview(
          'user-1',
          'review-1',
          { version: 0, rating: 5 },
          '11111111-1111-4111-8111-111111111111',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects an edit submitted exactly one moment past the deadline', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue({
        ...baseReview,
        editDeadline: new Date(Date.now() - 1),
      });

      await expect(
        service.editProductReview(
          'user-1',
          'review-1',
          { version: 0, rating: 5 },
          '11111111-1111-4111-8111-111111111111',
        ),
      ).rejects.toThrow('Edit window has closed');
    });

    it('accepts an edit right at the deadline boundary (not yet past it)', async () => {
      // The service compares editDeadline < now, so a deadline a moment in
      // the future (rather than an exact tie against a live clock, which is
      // not deterministically testable) is the boundary this test targets.
      prisma.tx.productReview.findUnique.mockResolvedValue({
        ...baseReview,
        editDeadline: new Date(Date.now() + 50),
      });
      prisma.tx.productReview.findUniqueOrThrow.mockResolvedValue({
        ...baseReview,
        rating: 5,
      });

      await expect(
        service.editProductReview(
          'user-1',
          'review-1',
          { version: 0, rating: 5 },
          '11111111-1111-4111-8111-111111111111',
        ),
      ).resolves.toBeDefined();
      expect(prisma.tx.productReviewRevision.create).toHaveBeenCalled();
    });

    it('creates a new sequential revision and resets moderationState to PENDING', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue(baseReview);
      prisma.tx.productReviewRevision.count.mockResolvedValue(1);
      prisma.tx.productReview.findUniqueOrThrow.mockResolvedValue({
        ...baseReview,
        rating: 5,
      });

      await service.editProductReview(
        'user-1',
        'review-1',
        { version: 0, rating: 5 },
        '11111111-1111-4111-8111-111111111111',
      );

      expect(prisma.tx.productReview.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ moderationState: 'PENDING' }) as object,
        }),
      );
      expect(prisma.tx.productReviewRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revisionNumber: 2 }) as object }),
      );
      expect(ratingAggregate.recalculateProductSummary).toHaveBeenCalled();
    });

    it('does not recalculate the aggregate when editing a HIDDEN review', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue({
        ...baseReview,
        visibility: 'HIDDEN',
      });
      prisma.tx.productReview.findUniqueOrThrow.mockResolvedValue({
        ...baseReview,
        visibility: 'HIDDEN',
      });

      await service.editProductReview(
        'user-1',
        'review-1',
        { version: 0, rating: 5 },
        '11111111-1111-4111-8111-111111111111',
      );

      expect(ratingAggregate.recalculateProductSummary).not.toHaveBeenCalled();
      // Visibility itself is left untouched by an edit.
      expect(prisma.tx.productReview.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            visibility: expect.anything() as unknown,
          }) as object,
        }),
      );
    });

    it('is idempotent on a replayed Idempotency-Key with the same payload', async () => {
      // Force the requestHash to match exactly what the service computes.
      const expectedHash = createHash('sha256')
        .update(JSON.stringify({ id: 'review-1', rating: 5, title: null, body: null }))
        .digest('hex');
      prisma.reviewModerationEvent.findUnique.mockResolvedValue({
        targetId: 'review-1',
        action: 'EDITED',
        requestHash: expectedHash,
      });
      prisma.productReview.findUnique.mockResolvedValue(baseReview);

      const result = await service.editProductReview(
        'user-1',
        'review-1',
        { version: 0, rating: 5 },
        '11111111-1111-4111-8111-111111111111',
      );

      expect(result).toEqual(baseReview);
      expect(prisma.tx.productReviewRevision.create).not.toHaveBeenCalled();
    });

    it('rejects a replayed Idempotency-Key used for a different request', async () => {
      prisma.reviewModerationEvent.findUnique.mockResolvedValue({
        targetId: 'review-1',
        action: 'EDITED',
        requestHash: 'different-hash',
      });

      await expect(
        service.editProductReview(
          'user-1',
          'review-1',
          { version: 0, rating: 5 },
          '11111111-1111-4111-8111-111111111111',
        ),
      ).rejects.toThrow('Idempotency-Key already used for a different request');
    });
  });

  describe('withdrawProductReview', () => {
    it('sets visibility to WITHDRAWN and recalculates the aggregate for a PUBLISHED review', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue({
        id: 'review-1',
        authorUserId: 'user-1',
        visibility: 'PUBLISHED',
        moderationState: 'APPROVED',
        productId: 'product-1',
      });
      prisma.tx.productReview.findUniqueOrThrow.mockResolvedValue({
        id: 'review-1',
        visibility: 'WITHDRAWN',
      });

      await service.withdrawProductReview(
        'user-1',
        'review-1',
        '22222222-2222-4222-8222-222222222222',
      );

      expect(prisma.tx.productReview.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ visibility: 'WITHDRAWN' }) as object }),
      );
      expect(ratingAggregate.recalculateProductSummary).toHaveBeenCalledWith(
        prisma.tx,
        'product-1',
      );
    });

    it('does not recalculate the aggregate when withdrawing an already-HIDDEN review', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue({
        id: 'review-1',
        authorUserId: 'user-1',
        visibility: 'HIDDEN',
        moderationState: 'FLAGGED',
        productId: 'product-1',
      });
      prisma.tx.productReview.findUniqueOrThrow.mockResolvedValue({});

      await service.withdrawProductReview(
        'user-1',
        'review-1',
        '33333333-3333-4333-8333-333333333333',
      );

      expect(ratingAggregate.recalculateProductSummary).not.toHaveBeenCalled();
    });

    it('rejects withdrawing a review that is already terminal (REMOVED/WITHDRAWN)', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue({
        id: 'review-1',
        authorUserId: 'user-1',
        visibility: 'WITHDRAWN',
        moderationState: 'APPROVED',
        productId: 'product-1',
      });

      await expect(
        service.withdrawProductReview(
          'user-1',
          'review-1',
          '44444444-4444-4444-8444-444444444444',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('returns 404 for a review that does not belong to the caller', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue({
        id: 'review-1',
        authorUserId: 'someone-else',
        visibility: 'PUBLISHED',
      });

      await expect(
        service.withdrawProductReview(
          'user-1',
          'review-1',
          '55555555-5555-4555-8555-555555555555',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reportProductReview', () => {
    it('requires details when reason is OTHER', async () => {
      await expect(
        service.reportProductReview(
          'reporter-1',
          'review-1',
          { reason: 'OTHER' as never, details: '   ' },
          '66666666-6666-4666-8666-666666666666',
        ),
      ).rejects.toThrow('details is required when reason is OTHER');
    });

    it('rejects self-reporting', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue({
        id: 'review-1',
        authorUserId: 'reporter-1',
        visibility: 'PUBLISHED',
        moderationState: 'APPROVED',
      });

      await expect(
        service.reportProductReview(
          'reporter-1',
          'review-1',
          { reason: 'SPAM' as never },
          '77777777-7777-4777-8777-777777777777',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects reporting content that is not PUBLISHED with 404', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue({
        id: 'review-1',
        authorUserId: 'author-1',
        visibility: 'HIDDEN',
        moderationState: 'FLAGGED',
      });

      await expect(
        service.reportProductReview(
          'reporter-1',
          'review-1',
          { reason: 'SPAM' as never },
          '88888888-8888-4888-8888-888888888888',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('flags moderationState on the first OPEN report but leaves visibility unchanged', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue({
        id: 'review-1',
        authorUserId: 'author-1',
        visibility: 'PUBLISHED',
        moderationState: 'APPROVED',
      });
      prisma.tx.reviewReport.findFirst.mockResolvedValue(null);
      prisma.tx.reviewReport.create.mockResolvedValue({ id: 'report-1' });

      await service.reportProductReview(
        'reporter-1',
        'review-1',
        { reason: 'SPAM' as never },
        '99999999-9999-4999-8999-999999999999',
      );

      expect(prisma.tx.productReview.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { moderationState: 'FLAGGED' } }),
      );
    });

    it('does not re-flag when an OPEN report already exists for this target', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue({
        id: 'review-1',
        authorUserId: 'author-1',
        visibility: 'PUBLISHED',
        moderationState: 'FLAGGED',
      });
      prisma.tx.reviewReport.findFirst.mockResolvedValue({ id: 'existing-report' });
      prisma.tx.reviewReport.create.mockResolvedValue({ id: 'report-2' });

      await service.reportProductReview(
        'reporter-2',
        'review-1',
        { reason: 'FRAUD' as never },
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );

      expect(prisma.tx.productReview.update).not.toHaveBeenCalled();
    });

    it('translates a concurrent duplicate-report unique-constraint violation into a ConflictException', async () => {
      prisma.tx.productReview.findUnique.mockResolvedValue({
        id: 'review-1',
        authorUserId: 'author-1',
        visibility: 'PUBLISHED',
        moderationState: 'APPROVED',
      });
      prisma.tx.reviewReport.create.mockRejectedValue(
        Object.assign(new Error('unique violation'), { code: 'P2002' }),
      );

      await expect(
        service.reportProductReview(
          'reporter-1',
          'review-1',
          { reason: 'SPAM' as never },
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });
});
