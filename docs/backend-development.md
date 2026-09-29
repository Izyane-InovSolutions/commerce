# Backend development

> Quick start only. The full engineer reference for the API is in [docs/backend/](backend/README.md): architecture, every module and route, configuration, data model and known gaps.

The Commerce API is a NestJS modular monolith in `services/commerce-api`. It uses
TypeScript, PostgreSQL, and Prisma.

## Requirements

- Node.js 24 or later
- npm 11 or later
- PostgreSQL

## Install and run

```bash
npm install
copy services/commerce-api/.env.example services/commerce-api/.env
npm run api:dev
```

The health endpoint is available at `GET /api/v1/health`.
Readiness is available at `GET /api/v1/health/ready`, process metrics at
`GET /api/v1/metrics`, and Swagger UI at `http://localhost:3000/api/docs`.

Apply schema changes locally with a descriptive migration name:

```bash
npm run prisma:migrate --workspace @commerce/commerce-api -- --name describe_change
```

The application uses PostgreSQL tables for durable background jobs, outbox
events, and bounded cache entries. This keeps the local stack limited to
NestJS, TypeScript, PostgreSQL, and Prisma.

## Background workers

Workers run inside the API process; there is no separate worker service. Each
one is safe to run on several API instances at once (row locks,
`SKIP LOCKED` leases or advisory locks). Set `SCHEDULED_WORKERS_ENABLED=false`
to turn every schedule off, as the integration tests do.

| Worker                           | Interval                                   | What it does                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JobWorkerService`               | 5 s                                        | Runs `background_jobs` rows: reservation expiry, cart cleanup, fulfillment provisioning, fulfillment-cancellation refunds, payment reconciliation.                                                           |
| `OutboxDispatcherService`        | `OUTBOX_DISPATCH_INTERVAL_MS` (5 s)        | Delivers `outbox_events` to registered subscribers, in order per aggregate, with retries and a dead-letter state.                                                                                            |
| `NotificationsOutboxSubscriber`  | (outbox)                                   | Turns `order.paid`, `payment.failed`, `order.cancelled`, `fulfillment.provisioned`, `fulfillment.dispatched`, `fulfillment.refund_required` and `shipment.delivered` into customer and seller notifications. |
| `NotificationDeliveryService`    | `NOTIFICATION_DELIVERY_INTERVAL_MS` (10 s) | Sends each notification's email copy through `MailerService`, with retries.                                                                                                                                  |
| `PaymentReconciliationScheduler` | 30 s                                       | With `PAYMENTS_PROVIDER=unified` only: queues a reconciliation job for every gateway payment still pending after 30 seconds.                                                                                 |
| `FxRatesRefreshScheduler`        | 1 h                                        | Refreshes live FX rates when `PAYMENT_FX_API_KEY` is set (see below).                                                                                                                                        |
| `ShipmentTrackingPollerService`  | 60 s                                       | Polls carrier providers for tracking on warehouse shipments.                                                                                                                                                 |
| `PayoutProcessingService`        | 60 s                                       | Releases matured seller funds and submits approved payout batches.                                                                                                                                           |

Domain code writes outbox events and jobs in the same transaction as the change
that causes them, so an event is never recorded for a change that rolled back.

## Notifications and email

Notifications are stored per user and listed through `GET /api/v1/notifications`.
Each one is also emailed. Configure outgoing mail with `SMTP_URL`, or with
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` and `SMTP_PASS`, and set
the sender with `MAIL_FROM`. With no SMTP settings, mail is written to the API
log in development and test, and is not sent in production.

Links in emails are built from `WEB_APP_URL` (the storefront) and
`SELLER_APP_URL` (the seller app). The seller app is served under `/seller`, so
include that base path, for example `http://localhost:3003/seller`. Password
reset requests are emailed as a link to `WEB_APP_URL/reset-password`.

## Media storage

`MEDIA_STORAGE_DRIVER` selects where uploads are stored. `local` (the default)
writes to `MEDIA_STORAGE_PATH`. `s3` uses any S3-compatible bucket, such as AWS
S3, Cloudflare R2 or MinIO, configured with `S3_BUCKET`, `S3_REGION`,
`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and
`S3_FORCE_PATH_STYLE`. Objects stay private with either driver. Clients
download them through the API's signed `/media/:id/download` URLs.

## Currency and payment methods

Catalog prices, carts, orders, refunds and seller accounts use **ZMW only**.
Checkout offers card and mobile money for the same ZMW-priced goods. Payment
method selection does not select a storefront currency. The current gateway
supports card, MTN Money and Airtel Money; additional methods require provider
adapters before they can accept payments.

The backend prepares foreign settlement with `PaymentCurrencyConverter` and
stores the quote in `payment_settlements` before charging. Customer payment
snapshots retain the original ZMW amount. The existing card connector supports
USD or GBP, configured using `UNIFIED_PAYMENTS_CARD_CURRENCY`. The converter
supports other currency minor units for future connectors.

Live rates come from `ExchangeRateApiProvider` (exchangerate-api.com). When
`PAYMENT_FX_API_KEY` is set, `FxRatesService` refreshes rates against
`PAYMENT_FX_BASE_CURRENCY` (default `ZMW`) every hour, stores them in `fx_rates`,
and keeps each rate usable for two refresh cycles.

`PAYMENT_FX_QUOTES` is the manual fallback, used when no API key is configured
(development and test). It is JSON keyed by settlement currency. Each entry must
contain `rate` (decimal string, target major units per ZMW), `quoteId`, and
`expiresAt` (ISO timestamp). No estimated rates are supplied. Missing, expired
or invalid quotes refuse foreign settlement. Gateway refunds remain unavailable
(see below).

Apply the migration before restarting the API:

```powershell
npm run prisma:deploy --workspace @commerce/commerce-api
npm run prisma:generate --workspace @commerce/commerce-api
```

Historical foreign-currency records are preserved for audit rather than
relabeled or silently converted. Foreign catalog prices do not qualify an
offer for publication or purchase; add an explicit ZMW price to such offers.
Historical foreign monetary amounts show as unavailable in the client.

## Checks

Run the repository checks from the repository root:

```bash
npm run format:check
npm run lint
npm test
npm run build
npm run test:e2e
```

The API also has an integration suite that runs against a real PostgreSQL
database. It uses its own database and never falls back to the application
database. Create an empty database whose name ends in `_test`, then run from
`services/commerce-api`:

```bash
TEST_DATABASE_URL=postgresql://commerce:commerce@localhost:5432/commerce_test?schema=public \
TEST_DATABASE_NAME=commerce_test \
npm run test:integration
```

The two variables can also go in `services/commerce-api/.env.integration`. The
suite applies migrations with `prisma migrate deploy` before it starts. The
checkout, payments and orders suites boot the full application with a fake
payment provider.

## Multi-seller orders and shipping

Checkout creates one seller order per seller, with `sellerId = null` for
first-party retail. Each seller order contains shipping groups separated by
fulfillment mode. Order items retain their offer, seller-order, and shipping-group
references; customer reads expose the complete order and seller reads expose only
that seller's child order.

Shipping quotes are snapshotted in minor currency units. At each level,
`total = subtotal + shippingAmount`; the parent amounts are the sum of child
amounts. `ZoneShippingRateProvider` quotes a flat rate per zone until a carrier
contract is selected. Domestic orders (`SHIPPING_DOMESTIC_COUNTRY`, default
`ZM`) pay `SHIPPING_DOMESTIC_RATE_MINOR` (`DOMESTIC_STANDARD_V1`), or nothing
at or above `SHIPPING_DOMESTIC_FREE_THRESHOLD_MINOR`
(`DOMESTIC_STANDARD_FREE_V1`). Other destinations pay
`SHIPPING_INTERNATIONAL_RATE_MINOR` (`INTERNATIONAL_STANDARD_V1`), and
`SHIPPING_UNSUPPORTED_COUNTRIES` are refused. The per-offer shipping amount set
through `PATCH /admin/catalog/offers/:id/shipping` is shown in catalog responses
only; checkout charges the zone rate. Replace `SHIPPING_RATE_PROVIDER` to
introduce carrier rates.

Warehouse shipments are booked through `ManualCarrierProvider`, the only carrier
provider. Sellers who ship their own orders report tracking themselves.

After building and applying migrations, run the real PostgreSQL verification
from `services/commerce-api`:

```bash
node --env-file=.env test/marketplace.database-check.cjs
```

The check creates isolated test records and removes them afterward.

## Not yet integrated

These parts still use stand-ins or are unavailable:

- **Gateway webhooks.** The gateway's signing scheme is undocumented, so
  `UnifiedPaymentProvider` rejects every callback. Payments are settled by
  reconciliation (`PaymentReconciliationScheduler` and
  `POST /payments/:id/status`).
- **Gateway refunds.** The current connectors do not support refunds. Refund
  cases are recorded and can be retried, but the unified provider refuses them.
- **Carriers.** Only the manual carrier exists. There is no carrier rate,
  booking or tracking integration.
- **Seller payouts.** `SELLER_PAYOUT_PROVIDER` accepts only `manual`. Payout
  batches are marked for reconciliation, and an admin confirms or fails each
  transfer made outside the platform (`POST /admin/payout-requests/:id/resolve`).
- **SMS and push notifications.** Only email has a sender. SMS is in the schema
  but has no provider, and there is no push channel.

## Module boundaries

Business capabilities belong under `src/modules`. Each module owns its HTTP
controllers, application services, validation, authorization policies, and data
access. A module must use another module through an exported service or explicit
interface; it must not access another module's database implementation directly.

Shared HTTP and domain primitives belong in `src/common`. Prisma configuration
belongs in `src/database`, and process-level concerns (config, jobs and the
outbox, workers, storage, logging) belong in `src/infrastructure`. External
provider adapters live next to the interface they implement, for example
`modules/payments/unified-payment.provider.ts`,
`modules/shipping/zone-shipping-rate.provider.ts`,
`modules/shipments/providers/manual-carrier.provider.ts` and
`infrastructure/storage/s3-storage.provider.ts`.

## Naming conventions

- HTTP routes use plural kebab-case nouns beneath `/api/v1`.
- TypeScript files use kebab-case and conventional NestJS suffixes.
- Prisma models use singular PascalCase names and fields use camelCase.
- Database tables and columns are mapped to plural snake_case names.
- Migration names use a lowercase descriptive phrase with underscores.
- Public identifiers are UUIDs and timestamps are stored in UTC.
