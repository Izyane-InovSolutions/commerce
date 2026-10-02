# Commerce API: backend documentation

> Engineer reference for `services/commerce-api`, the NestJS + PostgreSQL backend for the marketplace's storefront, seller portal, admin console and mobile app.

It describes the backend source (September 2026). Where these docs and the code disagree, **the code wins**. Please fix the doc in the same PR.

Current evidence and verification dates are maintained in the [gap register](known-gaps.md), [acceptance matrix](../backend-acceptance-matrix.md#current-baseline-2026-10-01), [baseline ledger](baseline-verification.md), [stock-adjustment verification](stock-adjustment-verification.md), [catalog-history verification](catalog-history-verification.md), [receipt-reversal verification](receipt-reversal-verification.md), [multipart-upload verification](multipart-upload-verification.md) and [Stage 6 measurement verification](measurement-baseline-verification.md). The [runtime inventory](runtime-inventory.md) lists routes, background work, external calls and state machines.

## At a glance

| Area         | Choices                                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape        | A modular monolith: one NestJS 11 process with 24 feature modules                                                                                                                                                    |
| Storage      | PostgreSQL via Prisma 6. The job queue, outbox, cache and sequence counters are ordinary tables; there is **no Redis**                                                                                               |
| API          | REST under `/api/v1`. Responses use the envelope `{ data, meta.requestId }`. OpenAPI UI at `/api/docs`                                                                                                               |
| Auth         | JWT access tokens (15 min), rotating opaque refresh tokens with reuse detection, and roles CUSTOMER / SELLER / STAFF / ADMIN                                                                                         |
| Money        | Integer minor units. **ZMW only** for prices and orders; card charges settle in USD or GBP through FX                                                                                                                |
| Marketplace  | Platform and seller offers on shared products. An order splits into a seller order per seller, then shipping groups. The seller ledger has commission and a hold period, and payouts go through approval and batches |
| Integrations | Unified Payments gateway (mobile money and card), exchangerate-api.com, SMTP. Carriers and payouts are manual                                                                                                        |

## Start here

1. [architecture.md](architecture.md): how the process, request pipeline, modules and conventions fit together.
2. [flows.md](flows.md): end-to-end purchase, return, seller and procurement flows.
3. [auth-and-access.md](auth-and-access.md): sessions, roles, guards and who can call what.
4. The module doc for whatever you are changing (below).

Reference pages:

- [configuration.md](configuration.md): every environment variable.
- [data-model.md](data-model.md): the schema by domain, and migrations.
- [background-processing.md](background-processing.md): jobs, the outbox and scheduled tasks.
- [integrations.md](integrations.md): external systems and the interfaces in front of them.
- [testing.md](testing.md): test layers and test-database safety.
- [known-gaps.md](known-gaps.md): current limitations and bugs, ranked.
- [remaining-hardening-plan.md](remaining-hardening-plan.md): proposed Steps 6–15 for correctness, security, performance, scalability and recovery, with completion criteria.

## Modules

Each module page has the same sections: purpose and features, every route, services, business rules and state machines, data, dependencies, jobs and events, configuration, tests, and known gaps.

| Group      | Module                                                              | What it covers                                                                                                                                |
| ---------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity   | [auth](modules/auth.md)                                             | Register, login, refresh rotation, password reset, email verification, handoff, sessions (see also [auth-sessions](modules/auth-sessions.md)) |
|            | [users](modules/users.md)                                           | Profile and address book                                                                                                                      |
| Catalog    | [catalog](modules/catalog.md)                                       | Categories, brands, attributes                                                                                                                |
|            | [products](modules/products.md)                                     | Products, variants, media, seller product submissions                                                                                         |
|            | [offers](modules/offers.md)                                         | Platform and seller listings, prices, public offer comparison                                                                                 |
|            | [inventory](modules/inventory.md)                                   | Warehouses, stock records, movements, reservations                                                                                            |
|            | [media](modules/media.md)                                           | Signed uploads and downloads, storage                                                                                                         |
| Shopping   | [cart](modules/cart.md)                                             | Guest and user carts, merge, live pricing                                                                                                     |
|            | [wishlist-and-saved-sellers](modules/wishlist-and-saved-sellers.md) | Saved offers and followed sellers                                                                                                             |
|            | [checkout](modules/checkout.md)                                     | Quote, cart checkout, buy-now, idempotent replay                                                                                              |
|            | [orders](modules/orders.md)                                         | Order split, lifecycle, customer / seller / admin views                                                                                       |
|            | [payments](modules/payments.md)                                     | Payment provider seam, gateway, reconciliation, refund cases, FX                                                                              |
|            | [reviews](modules/reviews.md)                                       | Verified reviews, seller ratings, reports, moderation                                                                                         |
| Sellers    | [sellers](modules/sellers.md)                                       | Applications and KYC, approval, storefronts                                                                                                   |
|            | [financials](modules/financials.md)                                 | Ledger, balances, payout accounts, requests and batches                                                                                       |
| Operations | [fulfillment](modules/fulfillment.md)                               | Pick, pack and dispatch; seller self-fulfillment; exceptions; cancellations                                                                   |
|            | [shipping](modules/shipping.md)                                     | Zone shipping rates                                                                                                                           |
|            | [shipments](modules/shipments.md)                                   | Carrier booking, tracking, webhooks                                                                                                           |
|            | [returns](modules/returns.md)                                       | Eligibility, returns (RMA), receipt, inspection, refund handoff                                                                               |
|            | [procurement](modules/procurement.md)                               | Suppliers, purchase orders, goods receipts                                                                                                    |
|            | [operations](modules/operations.md)                                 | Admin operations metrics                                                                                                                      |
| Platform   | [audit-and-health](modules/audit-and-health.md)                     | Audit trail, liveness and readiness probes                                                                                                    |

## Other docs

| Doc                                                                                                                  | Still useful for                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [../backend-development.md](../backend-development.md)                                                               | Quick start: install, run, migrate                                                                       |
| [../../services/commerce-api/API_TESTING.md](../../services/commerce-api/API_TESTING.md)                             | A walkthrough for trying endpoints in Swagger. It predates reviews, saved sellers and email verification |
| [../backend-release-1-verification.md](../backend-release-1-verification.md)                                         | Integration-database procedure and release-1 migration notes                                             |
| [../backend-acceptance-matrix.md](../backend-acceptance-matrix.md)                                                   | Tracing GitHub issues to acceptance criteria                                                             |
| [../github-issues-backend-audit-2026-09-25.md](../github-issues-backend-audit-2026-09-25.md)                         | The 2026-09-25 audit findings. The ones still true are carried into [known-gaps.md](known-gaps.md)       |
| [../../deploy/README.md](../../deploy/README.md)                                                                     | Running the stack on the internal server                                                                 |
| [../../services/commerce-api/src/common/openapi/README.md](../../services/commerce-api/src/common/openapi/README.md) | How OpenAPI contracts are generated                                                                      |
