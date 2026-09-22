import { describe, expect, it } from 'vitest';
import * as c from './reviews.ts';

const id = '00000000-0000-4000-8000-000000000001';
const date = '2026-09-20T12:00:00.000Z';
const owned = {
  id,
  authorUserId: id,
  rating: 4,
  deliveredAt: date,
  verifiedAt: date,
  visibility: 'PUBLISHED',
  moderationState: 'PENDING',
  version: 0,
  editDeadline: date,
  createdAt: date,
  updatedAt: date,
};
const product = {
  ...owned,
  orderItemId: id,
  productId: id,
  variantId: id,
  offerId: id,
  sellerId: null,
  title: null,
  body: 'A useful product review.',
};
const seller = { ...owned, sellerOrderId: id, sellerId: id, comment: null };

describe('review contracts', () => {
  it('parses both customer review kinds with edit/version provenance', () => {
    const result = c.backendOwnReviewsPageSchema.parse({
      items: [
        { ...product, kind: 'PRODUCT_REVIEW' },
        { ...seller, kind: 'SELLER_RATING' },
      ],
      page: 1,
      limit: 20,
      total: 2,
    });
    expect(result.items.map((item) => item.kind)).toEqual([
      'PRODUCT_REVIEW',
      'SELLER_RATING',
    ]);
    expect(result.items[0]?.editDeadline).toBe(date);
  });
  it('keeps private provenance out of public parsed projections', () => {
    const result = c.backendPublicProductReviewSchema.parse({
      ...product,
      reviewerLabel: 'Buyer B.',
      verifiedPurchase: true,
      product: { id, name: 'Product', slug: 'product' },
      seller: null,
    });
    expect(result).not.toHaveProperty('authorUserId');
    expect(result).not.toHaveProperty('orderItemId');
    expect(result).not.toHaveProperty('moderationState');
    expect(result.verifiedPurchase).toBe(true);
  });
  it('keeps report details and author identifiers out of seller projections', () => {
    const result = c.backendSellerRatingViewSchema.parse({
      ...seller,
      reviewerLabel: 'Buyer B.',
      hasOpenReport: true,
      ReviewReport: [{ reporterUserId: id, details: 'Private report' }],
    });
    expect(result).not.toHaveProperty('ReviewReport');
    expect(result).not.toHaveProperty('authorUserId');
    expect(result.hasOpenReport).toBe(true);
  });
  it.each([0, 6, 1.5])('rejects invalid stars %s', (rating) => {
    expect(
      c.backendSubmitProductReviewInputSchema.safeParse({
        orderItemId: id,
        rating,
        body: 'A useful review.',
      }).success,
    ).toBe(false);
  });
  it('validates body limits and requires an editing version', () => {
    expect(
      c.backendSubmitProductReviewInputSchema.safeParse({
        orderItemId: id,
        rating: 5,
        body: '          ',
      }).success,
    ).toBe(false);
    expect(
      c.backendSubmitProductReviewInputSchema.safeParse({
        orderItemId: id,
        rating: 5,
        body: 'x'.repeat(2001),
      }).success,
    ).toBe(false);
    expect(
      c.backendEditProductReviewInputSchema.safeParse({ rating: 5 }).success,
    ).toBe(false);
    expect(
      c.backendModerateReviewInputSchema.safeParse({ version: 1, reason: ' ' })
        .success,
    ).toBe(false);
  });
  it('preserves false filters and supports the backend date-only query format', () => {
    expect(
      c.backendAdminReviewQuerySchema.parse({
        hasOpenReport: false,
        createdFrom: '2026-09-01',
      }).hasOpenReport,
    ).toBe(false);
    expect(
      c.backendSellerReviewQuerySchema.parse({ reported: false }).reported,
    ).toBe(false);
  });
  it('represents unrated products without inventing a zero-star rating', () => {
    expect(
      c.backendRatingSummarySchema.parse({
        averageRating: null,
        ratingCount: 0,
        ratingHistogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      }).averageRating,
    ).toBeNull();
  });
  it('parses admin history independently of the public projection', () => {
    const detail = c.backendAdminReviewDetailSchema.parse({
      ...product,
      type: 'product',
      product: { id, name: 'Product', slug: 'product' },
      seller: null,
      author: {
        id,
        email: 'buyer@example.test',
        firstName: null,
        lastName: null,
      },
      orderItem: { id, orderId: id },
      ReviewReport: [],
      revisions: [],
      moderationEvents: [],
    });
    expect(detail.author.email).toBe('buyer@example.test');
    expect(detail.type).toBe('product');
  });
});
