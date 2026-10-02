# Runtime inventory

Inventoried **2026-10-02** at source revision `99a6b01`, then updated for the Stage 6 metrics and shutdown changes. This is the Stage 6 inventory of routes, background work, external calls and state transitions in the [remaining hardening plan](remaining-hardening-plan.md#6-close-evidence-gaps-and-establish-measurements). The [gap register](known-gaps.md) remains the authority for status.

Scope: `services/commerce-api`. Paths are relative to that directory unless they start with `docs/`. Status words follow the [register policy](known-gaps.md#evidence-and-status-policy). "Source-confirmed" means observed in code; none of these items has a new reproduction test.

Line references are to `99a6b01`. Stage 6 changed `src/main.ts`, `src/app.module.ts`, `src/database/prisma.service.ts`, `src/infrastructure/jobs/job-worker.service.ts`, `outbox-dispatcher.service.ts`, `src/modules/health/health.controller.ts`, `src/common/http/all-exceptions.filter.ts`, `env.validation.ts` and the metrics files. Lines in those files may have moved. Route counts and the metrics rows below already reflect the Stage 6 changes.

---

## 1. Routes

**Sources.** Operations come from `src/common/openapi/contracts.generated.json`: 295 operations at `99a6b01`, 296 after Stage 6 added `GET /api/v1/metrics/prometheus`. The generator does not store method or path, so those were taken from the controller decorators it walks (`scripts/generate-openapi.cjs:229-262`). At `99a6b01`, all 295 operation IDs matched exactly, and each route's `security` value agreed with its `@Public`/`@OptionalAuth` decorator.

**Global behavior.**

- Global prefix `api/v1` with no exclusions (`src/main.ts:45`). All paths below include it, so metrics is served at `/api/v1/metrics`, not `/metrics`.
- `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted` (`src/main.ts:46-54`). The JSON/urlencoded body limit is 1 MB (`src/main.ts:13,33-43`).
- Global guards:
  - `ThrottlerGuard` at 100 requests/min (`src/app.module.ts:57,96`).
  - `JwtAuthGuard`, `RolesGuard` and `EmailVerificationGuard` (`src/modules/auth/auth.module.ts:35-37`).
- Route-level overrides:
  - `@Throttle` is set on 6 auth routes (`src/modules/auth/auth.controller.ts:43,58,125,154,169,186`) and 6 review-write routes (`src/modules/reviews/customer-reviews.controller.ts:65-159`).
  - The seller controllers carry `@RequireVerifiedEmail`.

**Totals.**

| Measure | Count |
| --- | --- |
| Operations | 296 |
| Methods | GET 116, POST 124, PATCH 31, DELETE 21, PUT 4 |
| Auth | 29 `@Public` (one of them, the Prometheus route, requires the scrape token), 4 optional (`@OptionalAuth`, cart), 263 bearer |
| Role requirement on bearer routes | 106 `STAFF or ADMIN`, 55 `ADMIN`, 10 `SELLER`, 92 any authenticated user (ownership checked in services, e.g. `sellers.mine(userId)`) |

**Routes by area.** Controller paths are relative to `src/modules/` (`infra/` means `src/infrastructure/`). An area named after a class is a controller with an empty `@Controller()`; the generator then uses the class name as the tag (`scripts/generate-openapi.cjs:249-252`).

| Area (OpenAPI tag) | Routes | Methods | Public / optional / bearer | Roles (non-public routes) | Controller file(s) |
| --- | ---: | --- | --- | --- | --- |
| CustomerReturnsController | 5 | GET 3, POST 2 | 0 / 0 / 5 | any authenticated (5) | `returns/customer-returns.controller.ts` |
| GatewayPaymentsController | 5 | GET 2, POST 3 | 0 / 0 / 5 | any authenticated (3); ADMIN (2) | `payments/gateway-payments.controller.ts` |
| PublicOffersController | 3 | GET 3 | 3 / 0 / 0 | - | `offers/public-offers.controller.ts` |
| StorefrontsController | 4 | GET 3, PUT 1 | 3 / 0 / 1 | any authenticated (1) | `sellers/storefronts.controller.ts` |
| admin | 27 | GET 12, POST 15 | 0 / 0 / 27 | ADMIN (27) | `financials/admin-financials.controller.ts`, `financials/admin-payouts.controller.ts`, `payments/admin-refunds.controller.ts`, `reviews/admin/admin-reviews.controller.ts` |
| admin/analytics | 2 | GET 2 | 0 / 0 / 2 | STAFF or ADMIN (2) | `analytics/sales-analytics.controller.ts` |
| admin/audit-events | 2 | GET 2 | 0 / 0 / 2 | ADMIN (2) | `audit/audit-events.controller.ts` |
| admin/catalog/attributes | 8 | GET 2, POST 2, PATCH 2, DELETE 2 | 0 / 0 / 8 | STAFF or ADMIN (8) | `catalog/attributes/admin-attributes.controller.ts` |
| admin/catalog/brands | 5 | GET 2, POST 1, PATCH 1, DELETE 1 | 0 / 0 / 5 | STAFF or ADMIN (5) | `catalog/brands/admin-brands.controller.ts` |
| admin/catalog/categories | 7 | GET 3, POST 1, PUT 1, PATCH 1, DELETE 1 | 0 / 0 / 7 | STAFF or ADMIN (7) | `catalog/categories/admin-categories.controller.ts` |
| admin/catalog/offers | 7 | GET 2, POST 2, PATCH 2, DELETE 1 | 0 / 0 / 7 | STAFF or ADMIN (7) | `offers/admin-offers.controller.ts` |
| admin/catalog/products | 17 | GET 3, POST 5, PATCH 6, DELETE 3 | 0 / 0 / 17 | STAFF or ADMIN (17) | `products/admin-products.controller.ts` |
| admin/fulfillments | 14 | GET 3, POST 11 | 0 / 0 / 14 | STAFF or ADMIN (11); ADMIN (3) | `fulfillment/admin-fulfillments.controller.ts` |
| admin/inventory | 6 | GET 3, POST 2, PATCH 1 | 0 / 0 / 6 | STAFF or ADMIN (6) | `inventory/admin-inventory.controller.ts` |
| admin/inventory/warehouses | 5 | GET 2, POST 1, PATCH 1, DELETE 1 | 0 / 0 / 5 | STAFF or ADMIN (5) | `inventory/warehouses/admin-warehouses.controller.ts` |
| admin/operations | 1 | GET 1 | 0 / 0 / 1 | ADMIN (1) | `operations/operations-metrics.controller.ts` |
| admin/orders | 3 | GET 2, POST 1 | 0 / 0 / 3 | STAFF or ADMIN (3) | `orders/admin-orders.controller.ts`, `orders/cancellation/order-cancellation.controller.ts` |
| admin/procurement/goods-receipts | 5 | GET 1, POST 2, PATCH 1, DELETE 1 | 0 / 0 / 5 | STAFF or ADMIN (4); ADMIN (1) | `procurement/goods-receipts/goods-receipts.controller.ts` |
| admin/procurement/purchase-orders | 12 | GET 2, POST 9, PATCH 1 | 0 / 0 / 12 | STAFF or ADMIN (10); ADMIN (2) | `procurement/purchase-orders/purchase-orders.controller.ts` |
| admin/procurement/purchase-orders/:purchaseOrderId/receipts | 2 | GET 1, POST 1 | 0 / 0 / 2 | STAFF or ADMIN (2) | `procurement/goods-receipts/purchase-order-receipts.controller.ts` |
| admin/procurement/suppliers | 5 | GET 2, POST 2, PATCH 1 | 0 / 0 / 5 | STAFF or ADMIN (5) | `procurement/suppliers/suppliers.controller.ts` |
| admin/procurement/suppliers/:supplierId/products | 3 | GET 1, POST 1, PATCH 1 | 0 / 0 / 3 | STAFF or ADMIN (3) | `procurement/suppliers/supplier-products.controller.ts` |
| admin/returns | 9 | GET 2, POST 7 | 0 / 0 / 9 | ADMIN (5); STAFF or ADMIN (4) | `returns/admin-returns.controller.ts` |
| admin/sellers | 6 | GET 3, POST 3 | 0 / 0 / 6 | ADMIN (6) | `sellers/admin-sellers.controller.ts` |
| admin/shipments | 7 | GET 3, POST 4 | 0 / 0 / 7 | STAFF or ADMIN (7) | `shipments/admin-shipments.controller.ts` |
| admin/users | 5 | GET 2, POST 2, PATCH 1 | 0 / 0 / 5 | ADMIN (5) | `users/admin-users.controller.ts` |
| auth | 15 | GET 2, POST 10, PATCH 1, DELETE 2 | 7 / 0 / 8 | any authenticated (8) | `auth/auth.controller.ts` |
| cart | 5 | GET 1, POST 2, PATCH 1, DELETE 1 | 0 / 4 / 1 | guest or user (4); any authenticated (1) | `cart/cart.controller.ts` |
| catalog/best-sellers | 1 | GET 1 | 1 / 0 / 0 | - | `products/best-sellers.controller.ts` |
| catalog/brands | 2 | GET 2 | 2 / 0 / 0 | - | `catalog/brands/brands.controller.ts` |
| catalog/categories | 3 | GET 3 | 3 / 0 / 0 | - | `catalog/categories/categories.controller.ts` |
| catalog/deals | 1 | GET 1 | 1 / 0 / 0 | - | `products/deals.controller.ts` |
| catalog/products | 3 | GET 3 | 3 / 0 / 0 | - | `products/products.controller.ts` |
| checkout | 4 | POST 4 | 0 / 0 / 4 | any authenticated (4) | `checkout/checkout.controller.ts` |
| health | 2 | GET 2 | 2 / 0 / 0 | - | `health/health.controller.ts` |
| media | 5 | GET 2, POST 1, PUT 1, DELETE 1 | 1 / 0 / 4 | any authenticated (4) | `media/media.controller.ts` |
| metrics | 2 | GET 2 | 1 / 0 / 1 | ADMIN (1); scrape token (1) | `infra/metrics/metrics.controller.ts` |
| notifications | 3 | GET 1, POST 2 | 0 / 0 / 3 | any authenticated (3) | `notifications/notifications.controller.ts` |
| orders | 3 | GET 2, POST 1 | 0 / 0 / 3 | any authenticated (3) | `orders/orders.controller.ts`, `orders/cancellation/order-cancellation.controller.ts` |
| orders/:orderId/shipments | 1 | GET 1 | 0 / 0 / 1 | any authenticated (1) | `shipments/customer-shipments.controller.ts` |
| payments | 1 | POST 1 | 1 / 0 / 0 | - | `payments/payments.controller.ts` |
| reviews | 10 | GET 2, POST 4, PATCH 2, DELETE 2 | 0 / 0 / 10 | any authenticated (10) | `reviews/customer-reviews.controller.ts` |
| saved-sellers | 3 | GET 1, POST 1, DELETE 1 | 0 / 0 / 3 | any authenticated (3) | `saved-sellers/saved-sellers.controller.ts` |
| sellers | 3 | GET 1, POST 2 | 0 / 0 / 3 | any authenticated (3) | `sellers/sellers.controller.ts` |
| sellers/me | 12 | GET 7, POST 4, PATCH 1 | 0 / 0 / 12 | any authenticated (12) | `financials/seller-financials.controller.ts`, `financials/seller-payouts.controller.ts`, `sellers/seller-reviews.controller.ts` |
| sellers/me/analytics | 2 | GET 2 | 0 / 0 / 2 | any authenticated (2) | `analytics/seller-analytics.controller.ts` |
| sellers/me/fulfillments | 5 | POST 5 | 0 / 0 / 5 | any authenticated (5) | `fulfillment/seller-fulfillments.controller.ts` |
| sellers/me/inventory | 4 | GET 2, PUT 1, PATCH 1 | 0 / 0 / 4 | SELLER (4) | `inventory/seller-inventory.controller.ts` |
| sellers/me/offers | 6 | GET 2, POST 2, PATCH 2 | 0 / 0 / 6 | SELLER (6) | `offers/seller-offers.controller.ts` |
| sellers/me/orders | 2 | GET 2 | 0 / 0 / 2 | any authenticated (2) | `orders/seller-orders.controller.ts` |
| sellers/me/products | 9 | GET 2, POST 3, PATCH 2, DELETE 2 | 0 / 0 / 9 | any authenticated (9) | `products/seller-products.controller.ts` |
| sellers/me/returns | 1 | GET 1 | 0 / 0 / 1 | any authenticated (1) | `returns/seller-returns.controller.ts` |
| sellers/me/shipments | 1 | POST 1 | 0 / 0 / 1 | any authenticated (1) | `shipments/seller-shipments.controller.ts` |
| users | 2 | GET 1, PATCH 1 | 0 / 0 / 2 | any authenticated (2) | `users/users.controller.ts` |
| users/me/addresses | 6 | GET 2, POST 2, PATCH 1, DELETE 1 | 0 / 0 / 6 | any authenticated (6) | `users/addresses/addresses.controller.ts` |
| webhooks/shipping | 1 | POST 1 | 1 / 0 / 0 | - | `shipments/shipping-webhooks.controller.ts` |
| wishlist | 3 | GET 1, POST 1, DELETE 1 | 0 / 0 / 3 | any authenticated (3) | `wishlist/wishlist.controller.ts` |

### Routes without a user session (29 public and 4 optional-auth)

| Auth | Method | Path | Controller | Note |
| --- | --- | --- | --- | --- |
| public + token | GET | /api/v1/metrics/prometheus | `src/infrastructure/metrics/metrics.controller.ts` | `MetricsScrapeGuard`: bearer `METRICS_SCRAPE_TOKEN`, 404 when unset (S5). The JSON `GET /api/v1/metrics` is now ADMIN-only |
| public | GET | /api/v1/health | `src/modules/health/health.controller.ts` | |
| public | GET | /api/v1/health/ready | `src/modules/health/health.controller.ts` | |
| public | POST | /api/v1/auth/register | `src/modules/auth/auth.controller.ts` | brute-force throttle |
| public | POST | /api/v1/auth/login | same | brute-force throttle |
| public | POST | /api/v1/auth/refresh | same | |
| public | POST | /api/v1/auth/password-reset/request | same | brute-force throttle |
| public | POST | /api/v1/auth/password-reset/confirm | same | brute-force throttle |
| public | POST | /api/v1/auth/email-verification/confirm | same | |
| public | POST | /api/v1/auth/handoff/exchange | same | |
| public | GET | /api/v1/catalog/brands | `src/modules/catalog/brands/brands.controller.ts` | unbounded list (D6) |
| public | GET | /api/v1/catalog/brands/:slug | same | |
| public | GET | /api/v1/catalog/categories | `src/modules/catalog/categories/categories.controller.ts` | unbounded list (D6) |
| public | GET | /api/v1/catalog/categories/:slug | same | |
| public | GET | /api/v1/catalog/categories/:slug/attributes | same | unbounded list |
| public | GET | /api/v1/catalog/products | `src/modules/products/products.controller.ts` | paginated |
| public | GET | /api/v1/catalog/products/:slug | same | |
| public | GET | /api/v1/catalog/products/:slug/reviews | same | paginated |
| public | GET | /api/v1/catalog/best-sellers | `src/modules/products/best-sellers.controller.ts` | |
| public | GET | /api/v1/catalog/deals | `src/modules/products/deals.controller.ts` | |
| public | GET | /api/v1/catalog/variants/:id/offers | `src/modules/offers/public-offers.controller.ts` | |
| public | GET | /api/v1/catalog/offers/:id | same | |
| public | GET | /api/v1/storefronts/:slug/offers | same | |
| public | GET | /api/v1/storefronts | `src/modules/sellers/storefronts.controller.ts` | capped by `STOREFRONT_DIRECTORY_LIMIT` (`storefronts.service.ts:108-125`) |
| public | GET | /api/v1/storefronts/:slug | same | |
| public | GET | /api/v1/storefronts/:slug/ratings | same | |
| public | GET | /api/v1/media/:id/download | `src/modules/media/media.controller.ts` | HMAC-signed URL check (`media.service.ts:176-185`) |
| public | POST | /api/v1/payments/webhook | `src/modules/payments/payments.controller.ts` | returns 503 until the provider contract exists (`src/common/openapi/README.md`) |
| public | POST | /api/v1/webhooks/shipping/:providerCode | `src/modules/shipments/shipping-webhooks.controller.ts` | S1 |
| optional | GET | /api/v1/cart | `src/modules/cart/cart.controller.ts` | guest token or JWT |
| optional | POST | /api/v1/cart/items | same | |
| optional | PATCH | /api/v1/cart/items/:itemId | same | |
| optional | DELETE | /api/v1/cart/items/:itemId | same | |

---

## 2. Background work

**Control.**

- `ScheduleModule.forRoot` turns off `@Interval`/`@Cron`/`@Timeout` when `process.env.SCHEDULED_WORKERS_ENABLED === 'false'`. It reads this at module import time (`src/infrastructure/jobs/jobs.module.ts:12-16`).
- `registerRecurringTask` reads the same flag at runtime through `ConfigService` (`src/infrastructure/jobs/recurring-task.ts:14-16,36`). It skips a tick if the previous run is still going (`:39-52`).
- See N5 for how these two read paths diverge.

### 2a. Job handlers (`implements JobHandler`, registered in `src/infrastructure/workers/workers.module.ts:51-66`)

Runtime: `JobWorkerService.poll` runs `@Interval(5000)` with a process-local `isProcessing` flag and drains jobs until none are due (`src/infrastructure/jobs/job-worker.service.ts:8,22-41`). Claiming uses an optimistic compare-and-swap on `status`+`updatedAt` (`src/infrastructure/jobs/background-jobs.service.ts:47-90`). `RUNNING` rows older than 5 min are reclaimed, with no lease renewal (`:48,61-64`). A failed job retries with backoff `min(60 s, 2^attempts s)`. When attempts are exhausted it moves to `DEAD_LETTER` and `onDeadLetter` runs (`background-jobs.service.ts:113-138`, `job-worker.service.ts:53-63`). No enqueue site sets `maxAttempts`, so every job uses the schema default of **5** (`prisma/schema.prisma:373`).

| Job type | Handler file | Enqueued by (transactional?) | maxAttempts | What it does |
| --- | --- | --- | --- | --- |
| `payments.reconcile` | `src/modules/payments/jobs/payment-reconciliation.handler.ts:47-82` | `payment-reconciliation.scheduler.ts:71-77` (in the scheduler's tx) | 5 (default) | Only when `PAYMENTS_PROVIDER=unified`: refreshes the gateway status (`GatewayPaymentsService.refreshStatus`). Once the attempt has expired, the settlement has expired or `PAYMENT_RECONCILIATION_MAX_AGE_SECONDS` (default 3600) has passed, it cancels at the gateway and expires locally (`gateway-payments.service.ts:108-131`) |
| `inventory.expire_reservation` | `src/modules/inventory/jobs/inventory-expire-reservation.handler.ts` | `inventory.service.ts:702-709` (caller's client/tx, `runAt = expiresAt`) | 5 | `InventoryService.expireReservation(reservationId)` |
| `cart.cleanup_items` | `src/modules/cart/jobs/cart-cleanup.handler.ts` | `checkout.service.ts:106-109` (no tx; fallback after the inline cart write fails post-charge) | 5 | Removes the given cart lines, or clears the cart (R4) |
| `fulfillment.provision` | `src/modules/fulfillment/jobs/fulfillment-provision.handler.ts` | `orders.service.ts:623-626` (in the `confirmPayment` tx, together with outbox `order.paid`) | 5 | `FulfillmentProvisioningService.provisionForOrder` (H14) |
| `refunds.process_fulfillment_cancellation` | `src/modules/payments/jobs/fulfillment-cancellation-refund.handler.ts:58-114` | `fulfillments.service.ts:1397-1403`, `:1486-1492` (tx) | 5 | Prices the cancelled lines and calls `RefundCasesService.createCase` (idempotency key = sorted fulfillment line IDs), which immediately calls the provider (H3) |
| `email.send` | `src/infrastructure/email/email-send.handler.ts` | `email-deliveries.service.ts:54-57` (caller tx; callers `auth.service.ts:458,534,1007`) | 5 | Decrypts variables, re-checks the reset/verification token, sends SMTP through `SmtpEmailSender`. `onDeadLetter` marks the delivery `FAILED` |

### 2b. Schedulers and recurring tasks

| Task | Mechanism / interval | File | Replica safety (per source) |
| --- | --- | --- | --- |
| Job worker poll | `@Interval(5_000)` | `src/infrastructure/jobs/job-worker.service.ts:22` | Process-local overlap flag. Claim is a DB CAS, so two replicas cannot claim the same row, but there is a fixed 5-min stale reclaim with no lease renewal (N7). Since Stage 6, shutdown stops claiming and waits up to 10 s for the current job |
| Outbox dispatch (`outbox.dispatch`) | `registerRecurringTask`, `OUTBOX_DISPATCH_INTERVAL_MS` (default 5000). Batch `OUTBOX_DISPATCH_BATCH_SIZE` 50, lease `OUTBOX_DISPATCH_LEASE_MS` 60000 | `src/infrastructure/jobs/outbox-dispatcher.service.ts:37-44,60-78` | Replica-safe claim: `FOR UPDATE OF e SKIP LOCKED` plus an `availableAt` lease and per-aggregate ordering (`outbox.service.ts:37-64`) |
| Notification delivery (`notifications.delivery`) | `registerRecurringTask`, `NOTIFICATION_DELIVERY_INTERVAL_MS` (default 10000). Batch 25, 5 attempts, 5-min in-flight lease | `src/modules/notifications/delivery/notification-delivery.service.ts:18-28,81-89,105-112` | `pg_try_advisory_xact_lock(730022)` around claim. Sends happen after commit |
| Payment reconciliation sweep (`payments.reconciliation`) | `registerRecurringTask`, fixed 30000 ms. Only when `PAYMENTS_PROVIDER=unified` | `src/modules/payments/jobs/payment-reconciliation.scheduler.ts:19-27` | `pg_try_advisory_xact_lock(730021)`. Up to 100 payments older than 30 s per sweep (`:30-79`) |
| Payout processing | `@Interval(60_000)`: release matured funds, recover stale processing, resume batches, create and process batches | `src/modules/financials/payouts/payout-processing.service.ts:17-37` | Process-local `running` flag. Batch creation uses `FOR UPDATE SKIP LOCKED` (`payouts.service.ts:561-568`). Per-request/batch row locks (`:608,699,847`). Provider submit happens outside tx (`:763`) |
| Email delivery expiry | `@Interval(60_000)` `clearExpired` | `src/infrastructure/email/email-deliveries.service.ts:166-180` | Idempotent `updateMany` and no lock. Runs on every replica, which is harmless |
| Refresh-recovery data cleanup | `@Interval(60_000)` `cleanupExpiredRecoveryData` | `src/modules/auth/auth.service.ts:859-867` | Idempotent `updateMany`. Runs on every replica |
| FX rate refresh | `@Interval(3_600_000)` plus one call at boot (`onModuleInit`; skipped only when `NODE_ENV=test`) | `src/modules/payments/fx-rates-refresh.scheduler.ts:10,31-46` | No lock. Every replica calls the external API, and the boot call ignores `SCHEDULED_WORKERS_ENABLED` (N6) |
| Shipment tracking poll | `@Interval(60_000)` | `src/modules/shipments/shipment-tracking-poller.service.ts:21-31` → `shipments.service.ts:614-644` | No overlap flag and no lock. Unbounded `findMany`. No isolation per shipment (R3). Effectively a no-op with the manual carrier |

No `@Cron` or `@Timeout` exists in `src/`.

### 2c. Outbox topics

Events are written by `OutboxService.record` inside the caller's transaction (`src/infrastructure/jobs/outbox.service.ts:19-24`). `outbox_events.maxAttempts` defaults to 10 (`prisma/schema.prisma:395`). An event with no subscriber is marked `PUBLISHED` immediately (`outbox-dispatcher.service.ts:18-21,84-95`). There is **one subscriber**, `NotificationsOutboxSubscriber`, which is registered for 7 topics (`src/modules/notifications/notifications-outbox.subscriber.ts:26-34,73`). It fans out email-only notifications (`:40`).

| Topic | Recorded at | Subscriber |
| --- | --- | --- |
| `order.paid` | `src/modules/orders/orders.service.ts:629` | notifications |
| `order.cancelled` | `src/modules/orders/cancellation/order-cancellation.service.ts:18,163` | notifications |
| `payment.failed` | `src/modules/payments/payments.service.ts:46,377` | notifications |
| `fulfillment.provisioned` | `src/modules/fulfillment/provisioning/fulfillment-provisioning.service.ts:295,376` | notifications |
| `fulfillment.dispatched` | `src/modules/fulfillment/fulfillments.service.ts:649,1270` | notifications |
| `fulfillment.refund_required` | `src/modules/fulfillment/fulfillments.service.ts:1390,1474` (the refund job is also enqueued, see 2a) | notifications |
| `shipment.delivered` | `src/modules/shipments/shipments.service.ts:716` | notifications |
| `shipment.booked` | `src/modules/shipments/shipments.service.ts:350` | none |
| `procurement.po.submitted` / `.approved` / `.ordered` | `src/modules/procurement/purchase-orders/purchase-orders.service.ts:300,367,426` | none |
| `procurement.receipt.posted` / `.discrepancy_detected`, `procurement.po.completed`, `procurement.receipt.reversed` | `src/modules/procurement/goods-receipts/goods-receipts.service.ts:453,473,485,621` | none |
| `product_review.submitted` / `.edited` / `.withdrawn` | `src/modules/reviews/reviews.service.ts:161,386,575` | none |
| `seller_rating.submitted` / `.edited` / `.withdrawn` | `src/modules/reviews/reviews.service.ts:257,497,649` | none |

That is 20 distinct topics: 7 consumed and 13 recorded with no consumer.

---

## 3. External calls

| Dependency | Call site | Config | Timeout | Inside a DB transaction? | Retry |
| --- | --- | --- | --- | --- | --- |
| SMTP for auth mail (nodemailer `SmtpEmailSender`) | `src/infrastructure/email/smtp-email.sender.ts:18-41`, called from `email-deliveries.service.ts:126-131` | `SMTP_HOST` (required), `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`/`SMTP_PASS`, `EMAIL_FROM` | connection/greeting `SMTP_CONNECTION_TIMEOUT_MS` (10 s), socket `SMTP_SEND_TIMEOUT_MS` (30 s) | No. `send()` runs from the job handler with plain `this.prisma` reads (`email-deliveries.service.ts:60-150`) | `email.send` job: 5 attempts, exponential backoff up to 60 s. Delivery TTL 24 h (`:17`). At-least-once: a crash after SMTP accepts the message can resend it |
| SMTP for notifications (nodemailer `MailerService`) | `src/modules/notifications/delivery/mailer.service.ts:51,63-82`, through `email-channel.sender.ts` | `SMTP_URL` (overrides) or the `SMTP_*` group, `EMAIL_FROM`/`MAIL_FROM` | fixed 15 s connect/greeting/socket (`:16,84-90`); ignores the SMTP timeout variables (N4) | No. Claim tx commits before sending (`notification-delivery.service.ts:58-60,94-104`) | 5 attempts, backoff from 30 s doubling to 1 h (`notification-delivery.service.ts:18-21`) |
| S3-compatible storage (`@aws-sdk/client-s3`) | `src/infrastructure/storage/s3-storage.provider.ts:35-52` (client), `put`/`get`/`delete`. Driver chosen in `storage.module.ts:12-16` | `MEDIA_STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | None configured (SDK defaults; no `requestHandler`) | **Yes for upload.** `storage.put` runs inside `prisma.$transaction` after the asset is marked `AVAILABLE` (`src/modules/media/media.service.ts:150-162`). Delete calls storage after the DB update commits (`:187-197`). Download is outside tx (`:184`) | SDK default retry strategy (not configured). Orphan/atomicity gap is R9 |
| Unified Payments gateway (`fetch`) | `src/modules/payments/unified-payment.provider.ts:415-470`. Callers: `payments.service.ts:129` (initialize), `:245` (getPayment), `gateway-payments.service.ts:47,68,96,115,142`, `order-cancellation.service.ts:193` | `PAYMENTS_PROVIDER=unified`, `UNIFIED_PAYMENTS_BASE_URL`, `UNIFIED_PAYMENTS_API_KEY`, `UNIFIED_PAYMENTS_MERCHANT_ID`, `UNIFIED_PAYMENTS_CALLBACK_URL`, `UNIFIED_PAYMENTS_CARD_CURRENCY`, `UNIFIED_PAYMENTS_ALLOW_HTTP` (unvalidated) | `AbortSignal.timeout(UNIFIED_PAYMENTS_TIMEOUT_MS)`, default 15 s (`:434-441`). `redirect: 'error'` | No. `initializeForOrder` creates the payment row, calls the gateway, then updates (`payments.service.ts:109-196`). Checkout calls it after the order tx (`checkout.service.ts:61,141`; no `$transaction` in that file). Cancellation calls `stopAtGateway` before its tx (`order-cancellation.service.ts:131-133`) | No HTTP retry. Network/parse failure becomes `PaymentOutcomeUnknownException` and is marked for reconciliation (`payments.service.ts:170-182`). Ongoing retry comes from the `payments.reconcile` job (30 s sweep, 5 attempts). `refund()` returns 501 (H3, `:287-298`); `requestRefund` (`:235-249`) has no caller |
| FX rates (exchangerate-api.com, `fetch`) | `src/modules/payments/exchange-rate-api.provider.ts:21-75`, through `fx-rates.service.ts:34-65` | `PAYMENT_FX_API_KEY` (calls are skipped when unset), `PAYMENT_FX_BASE_CURRENCY` | 10 s (`:6,32-35`). `redirect: 'error'` | No. The upsert `$transaction` runs after the fetch returns (`fx-rates.service.ts:48-62`) | None. The next hourly refresh is the retry. Rates stay valid for 2 refresh cycles (`fx-rates.service.ts:11,40-42`) |
| Carriers (`CarrierProvider`) | Only `ManualCarrierProvider` (`src/modules/shipments/providers/manual-carrier.provider.ts`, registered at `shipments.module.ts:28-34`). No network | none | n/a | **Yes**: `book` inside `$transaction` (`shipments.service.ts:282,303`) and `cancel` inside `$transaction` (`:372,385`). `poll` runs outside tx (`:627`) | None (R3) |
| Payout provider | Only `ManualPayoutProvider` (`src/modules/financials/payouts/manual-payout.provider.ts`, `financials.module.ts:26-27`). No network | `SELLER_PAYOUT_PROVIDER` is validated but not read (C1) | n/a | No. `submit` runs after the claim tx (`payouts.service.ts:698-763`) | Stale `PROCESSING` recovery in the payout poll |

The only network clients in `src/` are nodemailer, the S3 SDK and global `fetch`. A search for `axios`, `node:http(s)` and `node:net` finds no other use. `src/integrations/` contains only a README.

---

## 4. State machines

Transition owners are the files whose Prisma `create`/`update`/`updateMany` writes the status field. Only purchase orders have an explicit transition table (`src/modules/procurement/purchase-orders/purchase-order-status.ts:10-39`). Every other lifecycle is enforced by conditional `where` clauses inside service methods.

| Entity (enum) | States | Transition owners (file:line of status writes) | Terminal states |
| --- | --- | --- | --- |
| Order / SellerOrder (`OrderStatus`) | PENDING_PAYMENT, PAID, CANCELLED, PARTIALLY_REFUNDED, REFUNDED | `orders/orders.service.ts:452,474` (create), `:605,613` (`confirmPayment`), `:678,698` (refund projection), `:724,728` (`cancel`, called by `orders/cancellation/order-cancellation.service.ts:142` and payment expiry) | CANCELLED, REFUNDED |
| Payment (`PaymentStatus`) | PENDING, REQUIRES_ACTION, PROCESSING, SUCCEEDED, FAILED, CANCELLED, PARTIALLY_REFUNDED, REFUNDED | `payments/payments.service.ts:109,185,391` (create / failed init / `applyEvent`); `payments/refund-cases.service.ts:502-510` (refunded amount) | FAILED, CANCELLED, REFUNDED (SUCCEEDED moves only to refund states) |
| Refund attempt (`RefundStatus`) | PENDING, PROCESSING, SUCCEEDED, FAILED, CANCELLED | `payments/refund-cases.service.ts:354,395,514` | SUCCEEDED, FAILED, CANCELLED |
| Refund case (`RefundCaseStatus`) | PENDING, PROCESSING, SUCCEEDED, PARTIALLY_SUCCEEDED, FAILED, RECONCILIATION_REQUIRED, CANCELLED | `payments/refund-cases.service.ts:226` (create), `:529` (outcome), `:552-560` (`transitionCase`) | SUCCEEDED, CANCELLED. FAILED can still be retried (`:285-310`). PROCESSING can get stuck (H4) |
| Return (`ReturnStatus`) | REQUESTED, APPROVED, REJECTED, CANCELLED, RECEIVING, RECEIVED, INSPECTING, CLOSED_NO_REFUND, REFUND_PENDING, PARTIALLY_REFUNDED, REFUNDED, REFUND_FAILED | `returns/returns.service.ts:394,483,527,716,729,862,1063,1159`; `payments/refund-cases.service.ts:590-604` (`projectReturnStatus`) | REJECTED, CANCELLED, CLOSED_NO_REFUND, REFUNDED. REFUND_FAILED and PARTIALLY_REFUNDED are treated as terminal in `operations/operations-metrics.service.ts:43-50` but can still move on retry |
| Fulfillment order (`FulfillmentStatus`) | AWAITING_ACCEPTANCE, READY_TO_PICK, PICKING, PARTIALLY_PICKED, PICKED, PACKING, PARTIALLY_PACKED, PACKED, PARTIALLY_DISPATCHED, DISPATCHED, ON_HOLD, PARTIALLY_CANCELLED, CANCELLED | `fulfillment/provisioning/fulfillment-provisioning.service.ts:331` (create); `fulfillment/fulfillments.service.ts:804` (accept), `:1601` (derived through `fulfillment/fulfillment-status.ts`) | DISPATCHED, CANCELLED (`operations-metrics.service.ts:36-39`) |
| Fulfillment work item / exception | PENDING, IN_PROGRESS, COMPLETED, CANCELLED / OPEN, RESOLVED | `fulfillment/fulfillments.service.ts:210,293` / `:470` | COMPLETED, CANCELLED / RESOLVED |
| Shipment (`ShipmentStatus`) | PENDING_BOOKING, BOOKED, DISPATCHED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, DELIVERY_FAILED, EXCEPTION, RETURN_TO_SENDER, RETURNED, CANCELLED | `shipments/shipments.service.ts:312` (book), `:396` (cancel), `:695` (tracking projection through `shipments/tracking-status.ts`); `fulfillment/fulfillments.service.ts:614,1180` (dispatch) | DELIVERED, DELIVERY_FAILED, RETURN_TO_SENDER, RETURNED, CANCELLED (`tracking-status.ts:3-9`). Manual events can bypass the workflow (H10) |
| Carrier webhook delivery | PENDING, PROCESSED, FAILED | `shipments/shipments.service.ts:561,593,601` | PROCESSED, FAILED (no retry, R2) |
| Reservation (`ReservationStatus`) | ACTIVE, COMMITTED, RELEASED, EXPIRED | `inventory/inventory.service.ts:862` (commit), `:937` (release/expire) | COMMITTED, RELEASED, EXPIRED |
| Purchase order (`PurchaseOrderStatus`) | DRAFT, SUBMITTED, APPROVED, REJECTED, ORDERED, PARTIALLY_RECEIVED, RECEIVED, CLOSED_SHORT, CANCELLED | `procurement/purchase-orders/purchase-orders.service.ts:490,673,728,773` (also `applyReceivedQuantities`/`reverseReceivedQuantities` called from `goods-receipts.service.ts:413-416,594`) | REJECTED, RECEIVED, CLOSED_SHORT, CANCELLED (`purchase-order-status.ts:27-38`) |
| Goods receipt (`GoodsReceiptStatus`) | DRAFT, POSTED, REVERSED | `procurement/goods-receipts/goods-receipts.service.ts:422,537,600` | REVERSED. A reversal receipt cannot itself be reversed (H6) |
| Seller application / account (`SellerStatus`) | PENDING, APPROVED, REJECTED, SUSPENDED | `sellers/sellers.service.ts:97-105` (apply/reapply), `:222-226` (admin status change, optimistic version) | none strictly (REJECTED can reapply to PENDING) |
| Product / variant / offer (`ProductStatus`) | DRAFT, PUBLISHED, ARCHIVED | `products/products.service.ts:475` (product `updateStatus`), `:558` (variant), `:907,925` (submission approval publishes); `offers/offers.service.ts:93` (admin offer); `offers/marketplace-offers.service.ts:186` (seller offer) | none (ARCHIVED is reversible) |
| Product submission (`ProductSubmissionStatus`) | PENDING, APPROVED, REJECTED | `products/products.service.ts:657,974` (submit/resubmit), `:907-910` (review) | none enforced (D4 bypass) |
| Payout request (`SellerPayoutStatus`) | REQUESTED, APPROVED, PROCESSING, SUCCEEDED, FAILED, CANCELLED, RECONCILIATION_REQUIRED | `financials/payouts/payouts.service.ts:320` (create), `:733,872,911,1037,1097,1142,1187` | SUCCEEDED, CANCELLED (FAILED can be retried) |
| Payout attempt / batch / account | PROCESSING, SUCCEEDED, FAILED, RECONCILIATION_REQUIRED / OPEN, PROCESSING, COMPLETED, COMPLETED_WITH_ERRORS / PENDING_VERIFICATION, VERIFIED, REJECTED, DISABLED | `financials/payouts/payouts.service.ts:862,925,1028,1089` / `:575,629` / `:187,215,278` | SUCCEEDED, FAILED / COMPLETED* / DISABLED |
| Background job (`BackgroundJobStatus`) | PENDING, RUNNING, SUCCEEDED, DEAD_LETTER | `infrastructure/jobs/background-jobs.service.ts:74,99,127` | SUCCEEDED, DEAD_LETTER |
| Outbox event (`OutboxEventStatus`) | PENDING, PUBLISHED, DEAD_LETTER | `infrastructure/jobs/outbox.service.ts:79,94` | PUBLISHED, DEAD_LETTER |
| Email delivery (`EmailDeliveryStatus`) | PENDING, SENT, FAILED | `infrastructure/email/email-deliveries.service.ts:143,155,168` | SENT, FAILED |
| Notification delivery | PENDING, SENT, FAILED, SKIPPED | `notifications/delivery/notification-delivery.service.ts:149,220` | SENT, SKIPPED (FAILED below 5 attempts is retried) |
| Media asset (`MediaStatus`) | PENDING_UPLOAD, AVAILABLE, DELETED | `media/media.service.ts:151,189` | DELETED |
| Cart (`CartStatus`) | ACTIVE, MERGED | `cart/cart.service.ts:226` | MERGED |
| Review (`ReviewVisibility` × `ReviewModerationState`) | PUBLISHED, HIDDEN, REMOVED, WITHDRAWN × PENDING, APPROVED, FLAGGED | `reviews/reviews.service.ts:343,455` (edit → PENDING), `:546,620` (withdraw), `:729,812` (report → FLAGGED); `reviews/admin/admin-reviews.service.ts:274,429,589` | WITHDRAWN |
| Review report (`ReviewReportStatus`) | OPEN, DISMISSED, ACTIONED | `reviews/admin/admin-reviews.service.ts:553,687` | DISMISSED, ACTIONED |
| Supplier (`SupplierStatus`) | ACTIVE, INACTIVE | `procurement/suppliers/suppliers.service.ts:141` | none |

(Paths in this table are relative to `src/modules/` unless prefixed `infrastructure/`.)

---

## 5. Untabled findings: re-verification and proposed IDs

### 5a. Data integrity and API consistency

| Proposed ID | Finding (current wording) | Re-verification at 99a6b01 | Stage |
| --- | --- | --- | --- |
| H15 (existing) | Product, variant and offer deletion | **Superseded by H15.** Protected by `products.service.ts:1568-1620` (`deleteUnlessUsed`), `offers.service.ts`, restrictive FKs in `prisma/migrations/20261001090000_preserve_order_and_stock_history/migration.sql`, and `test/catalog-deletion.integration-spec.ts`. Remaining by design: deleting an *unused* offer still cascades `cart_items`/`wishlist_items` (`prisma/schema.prisma:784-809`, `onDelete: Cascade`). That is not order or stock history | n/a |
| **D1** | Attribute and attribute-value deletion rewrites catalog history | **Partially confirmed (narrowed).** `AttributesService.remove`/`removeValue` hard-delete with no usage guard (`src/modules/catalog/attributes/attributes.service.ts:63-66,100-103`). The FK cascade reaches **only** `product_variant_attribute_values` (`schema.prisma:578`) and, for an attribute, `category_attributes` (`:483`) and its values (`:498`). **No order, cart, wishlist or stock row is deleted**: `OrderItem`, `CartItem` and `WishlistItem` reference offers only (`schema.prisma:784-809`, `:1011-1037`). But `OrderItem` keeps no variant or attribute snapshot, so past orders display the variant's live attributes and change retroactively. Required category attributes can also be silently removed from existing variants | 10 |
| **D2** | Warehouse deletion cascades stock rows | **No longer reproducible from source.** `WarehousesService.remove` locks the row, rejects any `inventory_records` and maps P2003 to 409 (`src/modules/inventory/warehouses/warehouses.service.ts:47-92`; landed in c1d7f31). The `InventoryRecord.warehouse` cascade (`schema.prisma:687`) is therefore unreachable through the API. Movements and reservations restrict record deletion (`:714,749`). PO, receipt, fulfillment, shipment, return-receipt and inspection FKs are `Restrict` (`:1430,1505,1651,1877,2139,2194`). Residual: `ReturnRequest.warehouse` is `SetNull` (`:2056`). Unit tests only (`warehouses.service.spec.ts:33-80`); no PostgreSQL test of `remove`. Proposed disposition: add a DB regression and then close | 10 |
| **D3** | Seller offers can draw platform stock | **Source-confirmed.** `stockSource` is a free `@IsEnum(OfferStockSource)` on seller create/update (`src/modules/offers/dto/seller-offer.dto.ts:37-38`) and is spread into `offer.create` (`marketplace-offers.service.ts:119-121`). Checkout reserves platform variant stock for any non-SELLER source (`orders.service.ts:533-546`). No DB CHECK ties `seller_id` to `stock_source` (`prisma/migrations/20260911073500_seller_storefronts_and_offers/migration.sql:11`) | 10 (aligns with Stage 9 ownership rules) |
| **D4** | Submission status can be bypassed | **Source-confirmed.** `updateStatus` writes `status` without checking `submissionStatus` (`src/modules/products/products.service.ts:470-480`). `updateVariantStatus` likewise (`:552-562`). Public reads do not filter on `submissionStatus` (only `analytics/attention.service.ts` references it outside products) | 10 |
| **D5** | Error codes outside the mapped set return `INTERNAL_ERROR` | **Source-confirmed (mapped set grew).** The map now covers 400/401/403/404/409/413/429/503 (`src/common/http/error-codes.ts:17-30`). Everything else falls back to `INTERNAL_ERROR`. 501 is thrown at `unified-payment.provider.ts:283,289,297,459` and `gateway-payments.service.ts:160`; 502 at `unified-payment.provider.ts:270`. No 422 is thrown in `src/` today | 10 |
| **D6** | Pagination inconsistent and many lists unbounded | **Source-confirmed, broader than written.** There are two envelope shapes. Most pages use `{items,total,page,limit}` (e.g. `OfferPage` `offers/marketplace-offers.service.ts:70`, `OrderPage` `orders/orders.service.ts:87`, `ReturnPage`, `AuditEventPage`, `AdminUserPage`). The shared `PaginatedResult {data, meta}` (`src/common/pagination/paginated-result.ts`) is used only by public products, product reviews and storefront ratings. **32 GET routes return bare arrays with no `limit`**, from the contract scan. Unbounded `findMany` examples: `GET /orders` (`orders.service.ts:734`), `GET /returns` (`returns.service.ts:368`), admin products (`products.service.ts:397`, full detail include), pending submissions (`:873`), seller products (`:847`), `GET /admin/inventory` (`inventory.service.ts:55`) and movements (`:130`), payout accounts (`payouts.service.ts:231,240`), wishlist (`wishlist.service.ts:18`), saved sellers (`saved-sellers.service.ts:12`), and the public `GET /catalog/brands` (`brands.service.ts:16-18`) and `/catalog/categories` (`categories.service.ts:17-21`) | 12 |
| **D7** | Operations metrics mix currencies, apply the warehouse filter unevenly, count refunds from all sources | **Partially fixed.** Currency mixing is **no longer reproducible**: sales, refunds and refund aggregates filter `currency: 'ZMW'` (`src/modules/operations/operations-metrics.service.ts:130,140,317`). **Still confirmed**: gross sales are never warehouse-filtered while refunds are (`:124-127` vs `:155-166`). With no warehouse filter, SUCCEEDED refund cases from every source are counted (`:138-169`) | 10 |
| **D8** | `GET /admin/orders?status=` rejected by `forbidNonWhitelisted` | **No longer reproducible from source.** `status` is now a field of `ListAdminOrdersDto` (`src/modules/orders/dto/list-admin-orders.dto.ts:6-10`; a90b334), with a unit test using the global pipe options (`list-admin-orders.dto.spec.ts:7-42`). Proposed disposition: close after an HTTP-level check. The same defect pattern remains on suppliers (N1) | 10 |
| **D9** | Review moderation: an edit clears FLAGGED; re-reporting is impossible after dismissal | **Source-confirmed.** An edit sets `moderationState: PENDING` for product reviews (`src/modules/reviews/reviews.service.ts:343`) and seller ratings (`:455`). The report dedupe indexes are unique on (reporter, target) with no status predicate (`prisma/migrations/20260917150100_reviews_ratings_moderation/migration.sql:287-293`). This contradicts the code comment "at most one OPEN report" (`reviews.service.ts:688`). A dismissed report therefore blocks any new report from the same user | 10 |

### 5b. Configuration drift

| Proposed ID | Finding | Re-verification at 99a6b01 | Stage |
| --- | --- | --- | --- |
| **C1** | `SELLER_PAYOUT_PROVIDER` validated but never read | **Source-confirmed.** `@IsIn(['manual'])` at `src/infrastructure/config/env.validation.ts:250-251`. No `config.get` anywhere. The provider is hard-wired at `src/modules/financials/financials.module.ts:26-27`. Low impact because the only allowed value matches the hard-wired one | 10 |
| **C2** | Runtime options read but not validated | **Source-confirmed, broader than written.** Unvalidated keys read in `src/`: `SCHEDULED_WORKERS_ENABLED` (`jobs.module.ts:13-15`, `recurring-task.ts:15`), `UNIFIED_PAYMENTS_ALLOW_HTTP` (`unified-payment.provider.ts:396`), `MAIL_FROM` (`mailer.service.ts:47`), `NOTIFICATION_DELIVERY_INTERVAL_MS` (`notification-delivery.service.ts:85`), `OUTBOX_DISPATCH_INTERVAL_MS` / `_BATCH_SIZE` / `_LEASE_MS` (`outbox-dispatcher.service.ts:40,62,63`), `PAYMENT_RECONCILIATION_MAX_AGE_SECONDS` (`payment-reconciliation.handler.ts:99`) | 10 |
| **C3** | `.env.example` missing variables | **Source-confirmed.** Read or validated but absent from `.env.example`: `SCHEDULED_WORKERS_ENABLED`, `UNIFIED_PAYMENTS_ALLOW_HTTP`, `NOTIFICATION_DELIVERY_INTERVAL_MS`, `OUTBOX_DISPATCH_INTERVAL_MS`, `OUTBOX_DISPATCH_BATCH_SIZE`, `OUTBOX_DISPATCH_LEASE_MS`, `PAYMENT_RECONCILIATION_MAX_AGE_SECONDS`, `SELLER_PAYOUT_HOLD_DAYS`, `SELLER_PAYOUT_MINIMUM_MINOR`, `SELLER_PAYOUT_PROVIDER`. (`SEED_ADMIN_*` appear only in the example and are used by the seed) | 10 |
| **C4** | `PAYMENT_FX_BASE_CURRENCY` configurable but conversion assumes ZMW | **Source-confirmed.** Validation is only `@MinLength(3)` (`env.validation.ts:272-274`). `FxRatesService.refresh` fetches and stores rates against the configured base (`fx-rates.service.ts:36-60`). `hydrateFromDb` drops `baseCurrency` (`:67-77`), and `RateEntry` has no base (`payment-currency-converter.ts:15-19`). `quote()` applies the rate to an order amount that `prepareInput` forces to ZMW (`unified-payment.provider.ts:99-100,110-113`). Any base other than ZMW produces wrong card settlement amounts | 10 |
| **C5** | `CacheService` exists but is unused | **Source-confirmed.** Only `src/app.module.ts:15,60` import `CacheModule`. `CacheService` is never injected | 12 (decide keep or remove with measured caching) |

### 5c. New candidate findings

| Proposed ID | Finding | Evidence | Stage |
| --- | --- | --- | --- |
| **N1** | `GET /admin/procurement/suppliers?status=` is probably rejected with 400. A bare `@Query('status')` sits next to `@Query() query: PaginationQueryDto` under `forbidNonWhitelisted`. This is the exact pattern documented as the admin-orders bug | `src/modules/procurement/suppliers/suppliers.controller.ts:27-33`; rationale in `src/modules/orders/dto/list-admin-orders.dto.spec.ts:7-8`; `src/main.ts:46-54` | 10 |
| **N2** | `GET /admin/inventory` passes unvalidated `warehouseId`/`variantId` query strings to Prisma UUID columns. A non-UUID is expected to surface as an unmapped Prisma error (500). Compare `admin-payouts.controller.ts:48-51`, which validates `sellerId`. Could be folded into R7 | `src/modules/inventory/admin-inventory.controller.ts:32-37`, `inventory.service.ts:55`; filter fallback `src/common/http/all-exceptions.filter.ts:29-33` | 10 |
| **N3** | Unbounded reads in operations and background paths: all backlog fulfillment rows, all inventory records and open/closed return rows on every operations call; all non-terminal shipments every minute | `src/modules/operations/operations-metrics.service.ts:224-227,248-251,330,337`; `src/modules/shipments/shipments.service.ts:615-623` | 12 |
| **N4** | Mail transport drift. `MailerService` uses a fixed 15 s timeout and ignores `SMTP_CONNECTION_TIMEOUT_MS`/`SMTP_SEND_TIMEOUT_MS`, which only the auth sender honors. Its `log`/`disabled` modes are unreachable because `SMTP_HOST` is required. `EMAIL_FROM`/`MAIL_FROM` fallback differs between the two senders | `src/modules/notifications/delivery/mailer.service.ts:16,44-61,84-90`; `src/infrastructure/email/smtp-email.sender.ts:16,23-28`; `src/infrastructure/config/env.validation.ts:58-60` | 10 |
| **N5** | `SCHEDULED_WORKERS_ENABLED` is read through `process.env` when `jobs.module.ts` is evaluated. That happens before `ConfigModule.forRoot` (called inside `AppModule`'s decorator) loads `.env`, while `registerRecurringTask` reads it later through `ConfigService`. With the flag set only in `.env`, the three `registerRecurringTask` tasks stop but the `@Interval` tasks (job worker, payouts, cleanups, FX, shipment poll) keep running. Inferred from module evaluation order (`ConfigModule.forRoot` loads env synchronously at call time, `node_modules/@nestjs/config/dist/config.module.js:73-102`). Needs a startup test | `src/infrastructure/jobs/jobs.module.ts:12-16`; `src/app.module.ts:17,52-56`; `src/infrastructure/jobs/recurring-task.ts:14-16` | 11 |
| **N6** | FX refresh is not coordinated. The boot refresh ignores `SCHEDULED_WORKERS_ENABLED`, and every replica polls hourly with no lock. Calls multiply against the provider quota noted in the code (1,500/month) | `src/modules/payments/fx-rates-refresh.scheduler.ts:7-10,31-46` | 11 (R8 sub-item) |
| **N7** | Job claims have a fixed 5-min stale reclaim and no lease renewal. A handler running longer can be claimed and run twice. The original worker's `complete`/`fail` then throws `ConflictException`, which aborts that poll's drain loop | `src/infrastructure/jobs/background-jobs.service.ts:47-48,61-64,104-107,117-121`; `job-worker.service.ts:46-63` | 11 |

| **N8** | Prisma Client loads `.env` from beside the schema at runtime (`relativeEnvPaths` in the generated client), so any variable the process leaves unset can be filled from the developer file regardless of working directory or `ConfigModule.ignoreEnvFile`. Reproduced 2026-10-02 while starting the load-test API from the scratch directory: it refreshed FX rates with the developer key at boot. Test isolation (`test/test-provider-env.ts`) already clears the provider keys | `node_modules/@prisma/client/runtime/library.js` (`relativeEnvPaths`); `src/modules/payments/fx-rates-refresh.scheduler.ts:31-34` | 10 |

Already covered, so no new ID:

- S3 `put` inside a DB transaction, and storage delete after the DB commit (`media.service.ts:150-162,187-197`): R9.
- Carrier `book`/`cancel` inside transactions: R3.
- Refund case set to PROCESSING before the provider call, outside a tx (`refund-cases.service.ts:375-391`): H4.
- 13 outbox topics with no subscriber: by design per `outbox-dispatcher.service.ts:18-21`; recorded here for inventory only.

### 5d. Register reconciliation

The register entries below disagreed with current source. All were reconciled in [known-gaps.md](known-gaps.md) on 2026-10-02:

- The corrected-baseline S3 row said multipart buffering lacked a transport size limit, while the S3 table row recorded the fix.
- S5 said `GET /metrics`. The served path is `/api/v1/metrics`, and it is now access-controlled.
- The "Destructive deletes" bullet is replaced by the H15 reference, D1 and D2.
- The "Admin order status filter" bullet (D8) is no longer reproducible from source.
