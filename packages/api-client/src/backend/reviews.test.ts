import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type ApiClient } from '../client.ts';
import * as api from './reviews.ts';

const id = '00000000-0000-4000-8000-000000000001';
const key = '00000000-0000-4000-8000-000000000002';
const date = '2026-09-20T12:00:00.000Z';
const base = {
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
  ...base,
  orderItemId: id,
  productId: id,
  variantId: id,
  offerId: id,
  sellerId: null,
  title: null,
  body: 'A useful product review.',
};
const seller = { ...base, sellerOrderId: id, sellerId: id, comment: null };
const detail = {
  ...product,
  type: 'product',
  product: { id, name: 'Product', slug: 'product' },
  seller: null,
  author: { id, email: 'buyer@example.test', firstName: null, lastName: null },
  orderItem: { id, orderId: id },
  ReviewReport: [],
  revisions: [],
  moderationEvents: [],
};
const report = {
  id,
  productReviewId: id,
  sellerRatingId: null,
  reporterUserId: id,
  reason: 'SPAM',
  details: null,
  status: 'OPEN',
  resolvedByUserId: null,
  resolutionNote: null,
  resolvedAt: null,
  createdAt: date,
};
const feed = { data: [], meta: { page: 1, limit: 20, total: 0 } };
const queue = { items: [], page: 1, limit: 20, total: 0 };
const storefront = {
  id,
  storefrontSlug: 'store',
  displayName: 'Store',
  description: null,
  averageRating: null,
  ratingCount: 0,
  ratingHistogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

type RouteCase = {
  name: string;
  call: (client: ApiClient) => Promise<unknown>;
  response: unknown;
  path: string;
  method: string;
  keyed?: boolean;
};
const cases: RouteCase[] = [
  {
    name: 'public reviews',
    call: (c) => api.backendListProductReviews(c, 'product'),
    response: feed,
    path: '/catalog/products/product/reviews',
    method: 'GET',
  },
  {
    name: 'storefront summary',
    call: (c) => api.backendGetPublicStorefront(c, 'store'),
    response: storefront,
    path: '/storefronts/store',
    method: 'GET',
  },
  {
    name: 'public seller ratings',
    call: (c) => api.backendListStorefrontRatings(c, 'store'),
    response: feed,
    path: '/storefronts/store/ratings',
    method: 'GET',
  },
  {
    name: 'eligibility',
    call: (c) => api.backendGetOrderReviewEligibility(c, id),
    response: { orderId: id, products: [], sellerOrders: [] },
    path: '/reviews/eligibility',
    method: 'GET',
  },
  {
    name: 'own reviews',
    call: (c) => api.backendListOwnReviews(c),
    response: queue,
    path: '/reviews/me',
    method: 'GET',
  },
  {
    name: 'product submission',
    call: (c) =>
      api.backendSubmitProductReview(c, {
        orderItemId: id,
        rating: 4,
        body: product.body,
      }),
    response: product,
    path: '/reviews/products',
    method: 'POST',
  },
  {
    name: 'seller submission',
    call: (c) =>
      api.backendSubmitSellerRating(c, { sellerOrderId: id, rating: 4 }),
    response: seller,
    path: '/reviews/sellers',
    method: 'POST',
  },
  {
    name: 'product editing',
    call: (c) =>
      api.backendEditProductReview(c, id, { version: 0, rating: 4 }, key),
    response: product,
    path: `/reviews/products/${id}`,
    method: 'PATCH',
    keyed: true,
  },
  {
    name: 'seller editing',
    call: (c) =>
      api.backendEditSellerRating(c, id, { version: 0, rating: 4 }, key),
    response: seller,
    path: `/reviews/sellers/${id}`,
    method: 'PATCH',
    keyed: true,
  },
  {
    name: 'product withdrawal',
    call: (c) => api.backendWithdrawProductReview(c, id, key),
    response: product,
    path: `/reviews/products/${id}`,
    method: 'DELETE',
    keyed: true,
  },
  {
    name: 'seller withdrawal',
    call: (c) => api.backendWithdrawSellerRating(c, id, key),
    response: seller,
    path: `/reviews/sellers/${id}`,
    method: 'DELETE',
    keyed: true,
  },
  {
    name: 'product reporting',
    call: (c) => api.backendReportProductReview(c, id, { reason: 'SPAM' }, key),
    response: report,
    path: `/reviews/products/${id}/reports`,
    method: 'POST',
    keyed: true,
  },
  {
    name: 'seller reporting',
    call: (c) => api.backendReportSellerRating(c, id, { reason: 'SPAM' }, key),
    response: { ...report, productReviewId: null, sellerRatingId: id },
    path: `/reviews/sellers/${id}/reports`,
    method: 'POST',
    keyed: true,
  },
  {
    name: 'seller reviews',
    call: (c) => api.backendListSellerReviews(c),
    response: feed,
    path: '/sellers/me/reviews',
    method: 'GET',
  },
  {
    name: 'seller ratings',
    call: (c) => api.backendListSellerRatings(c),
    response: feed,
    path: '/sellers/me/ratings',
    method: 'GET',
  },
  {
    name: 'admin queue',
    call: (c) => api.backendListAdminReviews(c),
    response: queue,
    path: '/admin/reviews',
    method: 'GET',
  },
  {
    name: 'admin detail',
    call: (c) => api.backendGetAdminReview(c, 'product', id),
    response: detail,
    path: `/admin/reviews/product/${id}`,
    method: 'GET',
  },
  {
    name: 'approval',
    call: (c) =>
      api.backendApproveReview(c, 'product', id, { version: 0 }, key),
    response: detail,
    path: `/admin/reviews/product/${id}/approve`,
    method: 'POST',
    keyed: true,
  },
  {
    name: 'hide',
    call: (c) =>
      api.backendHideReview(
        c,
        'product',
        id,
        { version: 0, reason: 'Policy' },
        key,
      ),
    response: detail,
    path: `/admin/reviews/product/${id}/hide`,
    method: 'POST',
    keyed: true,
  },
  {
    name: 'remove',
    call: (c) =>
      api.backendRemoveReview(
        c,
        'product',
        id,
        { version: 0, reason: 'Policy' },
        key,
      ),
    response: detail,
    path: `/admin/reviews/product/${id}/remove`,
    method: 'POST',
    keyed: true,
  },
  {
    name: 'restore',
    call: (c) =>
      api.backendRestoreReview(
        c,
        'product',
        id,
        { version: 0, reason: 'Policy' },
        key,
      ),
    response: detail,
    path: `/admin/reviews/product/${id}/restore`,
    method: 'POST',
    keyed: true,
  },
  {
    name: 'dismiss report',
    call: (c) =>
      api.backendDismissReviewReport(c, id, { reason: 'Resolved' }, key),
    response: { report, target: detail },
    path: `/admin/review-reports/${id}/dismiss`,
    method: 'POST',
    keyed: true,
  },
];

describe('review API client', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(cases)(
    'implements $name with its actual route and response shape',
    async ({ call, response, path, method, keyed }) => {
      const fetch = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                data: response,
                meta: { requestId: 'request' },
              }),
              { headers: { 'content-type': 'application/json' } },
            ),
          ),
        );
      vi.stubGlobal('fetch', fetch);
      const client = createApiClient({
        baseUrl: 'https://example.test/api/v1',
        envelope: true,
      });
      expect(await call(client)).toEqual(response);
      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(new URL(url).pathname).toBe('/api/v1' + path);
      expect(init.method).toBe(method);
      if (keyed) {
        expect(new Headers(init.headers).get('idempotency-key')).toBe(key);
        await call(client);
        expect(
          new Headers((fetch.mock.calls[1]![1] as RequestInit).headers).get(
            'idempotency-key',
          ),
        ).toBe(key);
      }
      if (method === 'GET') expect(init.cache).toBe('no-store');
    },
  );
  it('supports unconfigured envelope mode without losing the nested feed metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ data: feed, meta: { requestId: 'outer' } }),
          ),
        ),
    );
    expect(
      await api.backendListProductReviews(
        createApiClient({ baseUrl: 'https://example.test/api/v1' }),
        'product',
      ),
    ).toEqual(feed);
  });
  it('preserves false query filters and percent-encodes slugs', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(feed))),
      );
    vi.stubGlobal('fetch', fetch);
    const client = createApiClient({ baseUrl: 'https://example.test/api/v1' });
    await api.backendListSellerReviews(client, { reported: false });
    expect(
      new URL(fetch.mock.calls[0]![0] as string).searchParams.get('reported'),
    ).toBe('false');
    await api.backendListProductReviews(client, 'a/b ?');
    expect(new URL(fetch.mock.calls[1]![0] as string).pathname).toBe(
      '/api/v1/catalog/products/a%2Fb%20%3F/reviews',
    );
  });
  it('rejects malformed backend response data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    await expect(
      api.backendGetOrderReviewEligibility(
        createApiClient({ baseUrl: 'https://example.test/api/v1' }),
        id,
      ),
    ).rejects.toThrow();
  });
});
