# Backend development

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

`PAYMENT_FX_QUOTES` is a temporary backend quote source, not a live exchange-rate
feed. It is JSON keyed by settlement currency. Each entry must contain `rate`
(decimal string, target major units per ZMW), `quoteId`, and `expiresAt` (ISO
timestamp). No estimated rates are supplied. Missing, expired or invalid quotes
refuse foreign settlement. Replace this source with a trusted live FX adapter
before production use. Existing gateway refund support remains unavailable.

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

## Module boundaries

Business capabilities belong under `src/modules`. Each module owns its HTTP
controllers, application services, validation, authorization policies, and data
access. A module must use another module through an exported service or explicit
interface; it must not access another module's database implementation directly.

Shared HTTP and domain primitives belong in `src/common`. Prisma configuration
belongs in `src/database`. External provider adapters belong in
`src/integrations`, and process-level concerns belong in `src/infrastructure`.

## Naming conventions

- HTTP routes use plural kebab-case nouns beneath `/api/v1`.
- TypeScript files use kebab-case and conventional NestJS suffixes.
- Prisma models use singular PascalCase names and fields use camelCase.
- Database tables and columns are mapped to plural snake_case names.
- Migration names use a lowercase descriptive phrase with underscores.
- Public identifiers are UUIDs and timestamps are stored in UTC.
