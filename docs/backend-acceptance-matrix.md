# Backend acceptance matrix

This is the implementation baseline, not a completion certificate. Source: README development phases and GitHub issues #1–#61. Frontend/mobile UI requirements are excluded from backend delivery. Existing code references are candidate evidence until each acceptance criterion has been verified. Tests must run against an isolated database.

Statuses: **source-confirmed**, **reproduced**, **fixed and verified**, **externally blocked**, **deferred**. Definitions and current source corrections are in the [gap register](backend/known-gaps.md#evidence-and-status-policy). A passing unit test is not proof of provider delivery, PostgreSQL behavior, performance or deployment readiness.

## Current baseline (2026-09-30)

| Acceptance criterion | Status | Evidence / next gate | Verification date |
| --- | --- | --- | --- |
| Distinguish source review from executable evidence | source-confirmed | [Gap register](backend/known-gaps.md), this matrix and [execution ledger](backend/baseline-verification.md) | 2026-09-30 |
| Correct stale email, outbox, reconciliation, S3, media inspection, cancellation and audit claims | source-confirmed | [Correction table with source and test locations](backend/known-gaps.md#corrected-baseline-2026-09-30); historical reports retained | 2026-09-30 |
| Isolated PostgreSQL 17, commerce_test, loopback 55432, separate volume/credentials | fixed and verified | [Compose](../deploy/docker-compose.test.yml) and [test env example](../services/commerce-api/.env.integration.example); the healthy Docker Compose service passed all migrations and integration tests | 2026-09-30 |
| Node 24 CI with all requested backend checks and PostgreSQL 17 integration | source-confirmed | [Workflow](../.github/workflows/backend.yml); first GitHub run outstanding | 2026-09-30 |
| Keep test-database safeguards and disable scheduled/external providers | fixed and verified | Isolation regression, all 14 target-guard tests and the real PostgreSQL integration run passed. See [execution ledger](backend/baseline-verification.md). | 2026-09-30 |
| Local PostgreSQL integration execution | fixed and verified | 41 migrations, 15 suites and 71 tests passed against the dedicated Docker Compose PostgreSQL 17 service at 127.0.0.1:55432. CI provisions its own service. | 2026-09-30 |
| All local backend checks pass on the current checkout | fixed and verified | Typecheck, lint, formatting, Swagger, unit, HTTP, integration and build passed; first remote CI run remains separate | 2026-09-30 |
| Business hardening, frontend work, load/failover/restore certification | deferred | Outside Step 1; no acceptance claim | 2026-09-30 |

The detailed issue criteria below retain candidate source references. Their **criterion-level verification is deferred**, reviewed 2026-09-30, unless the current baseline or a dated checkpoint records exact evidence. This does not mean every feature is missing or every source reference has been executed. Dated checkpoints at the end remain historical and do not override this baseline.

## README cross-cutting requirements

| Requirement                                                              | Evidence                                                      | Status / remaining gate                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Modular monolith; PostgreSQL authority; shared API                       | services/commerce-api/src/app.module.ts; prisma/schema.prisma | source-confirmed; boundary and API acceptance audit pending                  |
| Server prices, immutable order snapshots, atomic stock, verified payment | checkout, inventory, orders, payments modules                 | source-confirmed; financial integration/hardening deferred                   |
| Auth, ownership, audit, PII, idempotency                                 | common/auth; auth/audit modules; infrastructure/logging       | source-confirmed; endpoint-by-endpoint negative-path audit pending           |
| Background jobs and outbox                                               | infrastructure/jobs                                           | source-confirmed; crash/replay tests and operational evidence pending        |
| Email/SMS/push/in-app notifications                                      | modules/notifications (outbox subscribers, in-app feed, log/SMTP email, log SMS) | source-confirmed; SMS/push vendors not wired; auth reset email implemented; live delivery evidence pending |
| Search and rebuildable projections                                       | products module; reviews aggregate script                     | source-confirmed; partial scope; advanced indexing/rebuild verification pending                 |
| Logging, metrics, tracing, errors, health                                | infrastructure/logging; infrastructure/metrics; health        | source-confirmed; partial scope; tracing/error reporting and deployment verification pending    |
| Environments, CI/CD, secrets, backup/restore, storage                    | docs/backend-development.md; infrastructure/storage           | externally blocked — deployment/restore evidence pending; CI source exists |
| No frontend/mobile screen work                                           | apps/\* excluded                                              | deferred — scope boundary                                                          |

## #9 — Establish repository and monorepo structure

Source: https://github.com/Izyane-InovSolutions/commerce/issues/9

Implementation evidence: `package.json`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                                                                | Status / remaining dependency                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Establish the monorepo structure using `apps/` and `services/`                                                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Create application boundaries for web, admin, seller and mobile clients                                                    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Create `services/commerce-api` as the single deployable NestJS modular monolith                                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Establish shared `packages/`, `docs/` and infrastructure locations as appropriate                                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Add formatting, linting, editor and Git conventions                                                                        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Add `.env.example` files without secrets                                                                                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Add contribution/development workflow documentation                                                                        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Define naming conventions for API routes, database migrations and shared contracts                                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| A new developer can clone the repository and understand where every application and service belongs                        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Web, admin, seller, mobile and Commerce API have independent build/test commands                                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| `services/commerce-api` clearly separates business modules from common, database, integrations and infrastructure concerns | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Shared contracts can be versioned without importing backend implementation details into clients                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| No credentials or environment-specific secrets are committed                                                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Repository conventions are documented                                                                                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #10 — Bootstrap NestJS Commerce API

Source: https://github.com/Izyane-InovSolutions/commerce/issues/10

Implementation evidence: `services/commerce-api/src/app.module.ts`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                            | Status / remaining dependency                                          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Bootstrap NestJS application under `services/commerce-api`                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Establish `src/modules/` as the business-module boundary                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Establish `/api/v1` routing                                                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Health/readiness endpoints                                                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Configuration loading and validation                                                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Structured request/response models and DTOs                                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Standard success/error envelope                                                        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Request ID and correlation ID middleware/interceptors                                  | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Global validation and exception handling                                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Graceful shutdown                                                                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| API documentation baseline                                                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| API starts cleanly from a documented command                                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| `/api/v1/health` and readiness checks work                                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Invalid configuration fails fast with actionable errors                                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| All client-facing errors use a consistent schema                                       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Global validation is enabled                                                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Modules follow NestJS dependency-injection and module-boundary conventions             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Modules do not directly access another module's repositories                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Middleware/interceptors/guards follow the established common/infrastructure boundaries | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #11 — Build PostgreSQL + Prisma schema and migration foundation

Source: https://github.com/Izyane-InovSolutions/commerce/issues/11

Implementation evidence: `services/commerce-api/prisma`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                                               | Status / remaining dependency                                          |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| PostgreSQL connection and pooling through the NestJS data layer                                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Prisma schema configuration and generated client                                                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Prisma migration tooling and baseline migration                                                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| UUID/public identifier strategy                                                                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Timestamp, soft-delete and audit conventions where appropriate                                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Initial schemas for users, roles, products, SKUs/variants and core commerce references                    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Foreign-key, index and unique-constraint standards                                                        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Transaction boundaries and Prisma transaction guidance                                                    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Repository/data-access boundaries so modules do not directly couple to each other's persistence internals | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Fresh database can be created from Prisma migrations only                                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Migrations are deterministic and tracked in source control                                                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Prisma client generation is documented and reproducible                                                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Core tables have appropriate keys and indexes                                                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Database conventions are documented                                                                       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| NestJS integration tests can run against a clean database                                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Module persistence boundaries are explicit                                                                | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #12 — Implement authentication, sessions and RBAC

Source: https://github.com/Izyane-InovSolutions/commerce/issues/12

Implementation evidence: `services/commerce-api/src/modules/auth`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                         | Status / remaining dependency                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Registration/login/logout flows                                     | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Password hashing and reset                                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Access/refresh token or secure session strategy                     | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| NestJS AuthModule and UsersModule boundaries                        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Role and permission model                                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Customer, seller, staff and admin authorization boundaries          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Guards, decorators and ownership checks                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Session/token revocation                                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Rate limiting for sensitive auth endpoints                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Protected endpoints reject unauthenticated requests                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Users cannot access resources outside their role or ownership scope | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Passwords are never stored in plaintext                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Refresh/revocation behavior is tested                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| NestJS guards/decorators provide reusable authorization primitives  | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Authorization rules are reusable by web and mobile clients          | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #13 — Add Redis caching and background job foundation

Source: https://github.com/Izyane-InovSolutions/commerce/issues/13

Implementation evidence: `services/commerce-api/src/infrastructure`. Note: the implementation is PostgreSQL-backed (a `CacheEntry` table for caching and a Postgres job queue), not Redis; the Redis-specific rows below describe the issue as written and cannot be verified against this code.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                            | Status / remaining dependency                                          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Redis connection/configuration under `src/infrastructure`                              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Cache abstraction with TTL support                                                     | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Rate-limit primitives for NestJS                                                       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Background job queue/worker foundation                                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Retry and dead-letter strategy                                                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Job observability and failure logging                                                  | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Dependency-injection interfaces so domain modules do not depend directly on Redis APIs | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| NestJS modules can use Redis through an application/infrastructure abstraction         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Jobs survive transient failures through controlled retries                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Failed jobs are observable and do not loop indefinitely                                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Local development includes Redis and documented commands                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Redis infrastructure can be changed without rewriting domain modules                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #14 — Establish observability, audit logging and security baseline

Source: https://github.com/Izyane-InovSolutions/commerce/issues/14

Implementation evidence: `services/commerce-api/src/infrastructure`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                        | Status / remaining dependency                                          |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Structured application logging for NestJS                                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Error tracking and alerting hooks                                                  | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Request correlation across API requests and background jobs                        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Audit event model for privileged/business-critical actions                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Security headers and secure defaults                                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Centralized validation and exception handling                                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| PII/log redaction policy                                                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Basic metrics for API latency, errors and background jobs                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Every API request has a traceable request ID                                       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Sensitive values are excluded from logs                                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Admin/security-sensitive actions create audit events                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Errors can be correlated to requests/jobs                                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Operational runbooks document common failure modes                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Logging, interceptors, filters and metrics respect the modular monolith boundaries | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #15 — Define object storage and media pipeline

Source: https://github.com/Izyane-InovSolutions/commerce/issues/15

Implementation evidence: `services/commerce-api/src/modules/media`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                | Status / remaining dependency                                          |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Object storage abstraction under `src/infrastructure` / `src/integrations` | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Signed upload/download URLs                                                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Media metadata model and persistence through the appropriate domain module | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Image validation and size limits                                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Thumbnail/variant processing hook                                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Orphan cleanup strategy                                                    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Dependency-injection interface for storage providers                       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Clients never receive storage credentials                                  | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Uploads are validated and associated with authorized resources             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Storage provider can be changed behind an abstraction                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Media lifecycle is auditable                                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Domain modules do not directly depend on provider-specific SDK details     | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #16 — Define in-house payment gateway integration contract

Source: https://github.com/Izyane-InovSolutions/commerce/issues/16

Implementation evidence: `services/commerce-api/src/modules/payments`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                                           | Status / remaining dependency                                          |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Payment provider interface under `src/modules/payments` and adapter boundary under `src/integrations` | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Payment initialization/status/verification operations                                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Webhook/callback contract                                                                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Idempotency requirements                                                                              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Refund interface                                                                                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Payment state machine                                                                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Gateway event persistence model                                                                       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Failure, timeout and reconciliation rules                                                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| NestJS dependency-injection contract between PaymentsModule and the gateway adapter                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Payments domain does not depend on gateway-specific payloads                                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Duplicate callbacks cannot duplicate payment/order effects                                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Payment states and transitions are documented                                                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Refunds and failures have explicit states                                                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| A sandbox/mock provider can be used in automated tests                                                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Gateway-specific SDK/API code is isolated under the integration boundary                              | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #17 — Implement catalog, categories and product data APIs

Source: https://github.com/Izyane-InovSolutions/commerce/issues/17

Implementation evidence: `services/commerce-api/src/modules/products`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                               | Status / remaining dependency                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Categories and category hierarchy                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Brands and attributes                                     | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Products, variants/SKUs and media                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Product status/publishing workflow                        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Pricing references                                        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Public catalog endpoints                                  | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Pagination and basic caching                              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Published products are retrievable through versioned APIs | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Variant/SKU data is explicit and consistent               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Unpublished products are hidden from public APIs          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Product model can later have multiple seller offers       | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #18 — Build Next.js storefront shell and navigation

Source: https://github.com/Izyane-InovSolutions/commerce/issues/18

Client implementation excluded. Verify compatibility of existing backend APIs when clients integrate; do not close this issue solely on backend evidence.

## #19 — Build product discovery, search and filtering UI

Source: https://github.com/Izyane-InovSolutions/commerce/issues/19

Client implementation excluded. Verify compatibility of existing backend APIs when clients integrate; do not close this issue solely on backend evidence.

## #20 — Implement product detail and offer-ready presentation

Source: https://github.com/Izyane-InovSolutions/commerce/issues/20

Client implementation excluded. Verify compatibility of existing backend APIs when clients integrate; do not close this issue solely on backend evidence.

## #21 — Implement cart, wishlist and customer account

Source: https://github.com/Izyane-InovSolutions/commerce/issues/21

Implementation evidence: `services/commerce-api/src/modules/cart`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                               | Status / remaining dependency                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Customer profile APIs/UI                                  | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Address book                                              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Cart creation/update/remove                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Cart validation against current prices and stock          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Wishlist                                                  | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Guest-to-account cart merge                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Cart is persisted server-side for authenticated customers | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Invalid quantity/stock is rejected by the backend         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Price changes are revalidated before checkout             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Wishlist and addresses are protected by ownership rules   | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #22 — Implement checkout, order creation and in-house payment flow

Source: https://github.com/Izyane-InovSolutions/commerce/issues/22

Implementation evidence: `services/commerce-api/src/modules/checkout`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                 | Status / remaining dependency                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Checkout validation and pricing snapshot                    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Customer address/shipping selection                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Order creation with immutable line-item snapshots           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Payment attempt creation                                    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| In-house gateway initialization                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Callback/webhook verification                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Idempotent payment handling                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Order confirmation after verified payment                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Client cannot mark an order as paid                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Payment is confirmed only by trusted backend verification   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Duplicate callbacks are harmless                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Failed/expired payments leave clear order/payment states    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Successful payment produces a customer-visible confirmation | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #23 — Build customer orders, history and status UI

Source: https://github.com/Izyane-InovSolutions/commerce/issues/23

Client implementation excluded. Verify compatibility of existing backend APIs when clients integrate; do not close this issue solely on backend evidence.

## #24 — Add retail storefront testing and release hardening

Source: https://github.com/Izyane-InovSolutions/commerce/issues/24

Implementation evidence: `services/commerce-api/test`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                          | Status / remaining dependency                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Unit tests for pricing/cart/checkout rules           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| API integration tests                                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Payment callback/idempotency tests                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| End-to-end customer purchase flow                    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Responsive/accessibility checks                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Performance checks for key public pages              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Production configuration checklist                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Critical purchase paths are automated                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Payment failures and duplicate callbacks are covered | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| No critical responsive/accessibility issues remain   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Production release checklist is documented           | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #25 — Implement warehouses and inventory model

Source: https://github.com/Izyane-InovSolutions/commerce/issues/25

Implementation evidence: `services/commerce-api/src/modules/inventory`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                       | Status / remaining dependency                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Warehouses and locations                                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| SKUs and stock records                                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Available/reserved/committed quantities                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Stock adjustments                                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Inventory API and admin views                                     | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Low-stock thresholds                                              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Stock cannot become negative through normal order flows           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Inventory quantities are separated by state                       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Every adjustment records actor, reason and timestamp              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| APIs expose availability without exposing internal mutation rules | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #26 — Implement stock reservations and order inventory lifecycle

Source: https://github.com/Izyane-InovSolutions/commerce/issues/26

Implementation evidence: `services/commerce-api/src/modules/inventory`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                              | Status / remaining dependency                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Reserve stock at the defined order/payment boundary      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Reservation expiry/release rules                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Commit stock for fulfilled orders                        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Release stock for cancellations/failures                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Concurrency protection/transactions                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Inventory movement audit trail                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Concurrent checkout cannot oversell a SKU                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Failed/cancelled orders release reservations correctly   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Fulfillment commits stock exactly once                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Inventory lifecycle is recoverable from movement history | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #27 — Build suppliers, purchase orders and goods receiving

Source: https://github.com/Izyane-InovSolutions/commerce/issues/27

Implementation evidence: `services/commerce-api/src/modules/procurement`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                              | Status / remaining dependency                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Supplier records                                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Purchase orders and line items                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| PO status workflow                                       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Goods receiving                                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Partial receipts and discrepancies                       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Inventory updates from receipts                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Supplier/order audit history                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Receiving increases the correct warehouse/SKU stock      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Partial and over/under deliveries are handled explicitly | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Purchase orders have controlled status transitions       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Inventory changes are traceable to receiving events      | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #28 — Implement fulfillment workflows and warehouse picking

Source: https://github.com/Izyane-InovSolutions/commerce/issues/28

Implementation evidence: `services/commerce-api/src/modules/fulfillment`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                      | Status / remaining dependency                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Fulfillment orders/work items                                    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Picking and packing statuses                                     | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Warehouse assignment                                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Partial fulfillment                                              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Packing and dispatch events                                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Cancellation handling after fulfillment begins                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Every fulfillable order line has a clear fulfillment state       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Picking/packing actions are authorized and audited               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Partial fulfillment is supported without corrupting order totals | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Dispatch can only occur from a valid packed state                | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #29 — Implement shipping, tracking and delivery states

Source: https://github.com/Izyane-InovSolutions/commerce/issues/29

Implementation evidence: `services/commerce-api/src/modules/shipments`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                    | Status / remaining dependency                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Shipping methods/rates                                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Shipment records                                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Tracking references                                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Carrier abstraction                                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| In-transit/out-for-delivery/delivered states                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Customer tracking view                                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Delivery event history                                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Shipments are linked to fulfillments and orders                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Tracking updates are idempotent and auditable                  | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Customer-facing status is derived from trusted shipment events | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Carrier implementation is provider-agnostic                    | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #30 — Build returns, refunds and retail operations dashboard

Source: https://github.com/Izyane-InovSolutions/commerce/issues/30

Implementation evidence: `services/commerce-api/src/modules/returns`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                         | Status / remaining dependency                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Return request workflow                                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Return eligibility and reasons                                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Inspection/receipt state                                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Refund creation through payment abstraction                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Refund event/audit model                                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Operations dashboard for orders, inventory, fulfillment and returns | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Basic retail reporting                                              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Refunds are tied to verified payment transactions                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Returns and refunds have explicit status transitions                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Staff permissions are enforced                                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Operational metrics can be filtered by date/status/warehouse        | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #31 — Implement seller registration and onboarding

Source: https://github.com/Izyane-InovSolutions/commerce/issues/31

Implementation evidence: `services/commerce-api/src/modules/sellers`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                      | Status / remaining dependency                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| Seller account/profile                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Business details                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Verification/KYB data model                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Required documents/media                         | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Onboarding states                                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Admin review queue                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Approval, rejection and suspension actions       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Seller cannot publish offers before approval     | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Onboarding status is explicit and auditable      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Admin actions are permission-controlled          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Sensitive verification data is access-restricted | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #32 — Implement seller storefronts and marketplace offer model

Source: https://github.com/Izyane-InovSolutions/commerce/issues/32

Implementation evidence: `services/commerce-api/src/modules/offers`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                               | Status / remaining dependency                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Seller storefront profile                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Product-to-seller Offer relation                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Offer price, stock source, condition and fulfillment mode | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Seller-specific SKU/listing metadata                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Offer publishing/unpublishing                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Customer offer selection API                              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| One Product can have multiple Offers                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Retail is represented as a first-party offer              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Suspended/unapproved sellers cannot publish offers        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Customers can compare/select eligible offers              | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #33 — Build seller inventory and catalog management portal

Source: https://github.com/Izyane-InovSolutions/commerce/issues/33

Implementation evidence: `services/commerce-api/src/modules/inventory`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                      | Status / remaining dependency                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Seller dashboard shell                                                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Offer/listing create/edit/archive                                                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Seller SKU/inventory quantities                                                  | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Bulk inventory update foundation                                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Media upload                                                                     | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Listing validation and publish workflow                                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Sellers can manage only their own offers/inventory                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Listing validation prevents incomplete/invalid offers from publication           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Inventory updates are auditable                                                  | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Canonical product data cannot be modified by sellers without explicit permission | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #34 — Implement unified cart and multi-seller order splitting

Source: https://github.com/Izyane-InovSolutions/commerce/issues/34

Implementation evidence: `services/commerce-api/src/modules/orders`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                              | Status / remaining dependency                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Cart lines tied to Offer IDs                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Seller/fulfillment grouping                              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Order + child seller/fulfillment records                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Price/stock validation across sellers                    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Shipping grouping and totals                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Seller order visibility                                  | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| One customer checkout can contain multiple sellers       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Backend calculates seller splits deterministically       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Each seller sees only its own order lines                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Customer sees one coherent order with fulfillment groups | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #35 — Implement marketplace commissions, balances and ledger

Source: https://github.com/Izyane-InovSolutions/commerce/issues/35

Implementation evidence: `services/commerce-api/src/modules/financials`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                  | Status / remaining dependency                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Platform/seller financial accounts                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Commission configuration                                     | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Per-order commission transactions                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Seller payable balance                                       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Immutable ledger entries                                     | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Adjustments/reversals                                        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Reconciliation references                                    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Seller earnings can be derived from ledger entries           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Commission calculations are auditable per order line/seller  | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Refunds/cancellations reverse financial effects correctly    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| No balance changes occur without corresponding ledger events | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #36 — Implement seller payouts and reconciliation

Source: https://github.com/Izyane-InovSolutions/commerce/issues/36

Implementation evidence: `services/commerce-api/src/modules/financials/payouts`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                    | Status / remaining dependency                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Payout account/profile model                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Payout request workflow                        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Minimum/hold rules                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Payout batches/transactions                    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Idempotency and duplicate prevention           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Reconciliation status                          | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Payout history                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Sellers cannot withdraw unavailable/held funds | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Payouts reference ledger balances              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Duplicate payout attempts are prevented        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Failed payouts remain traceable and retryable  | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #37 — Build seller order and fulfillment portal

Source: https://github.com/Izyane-InovSolutions/commerce/issues/37

Implementation evidence: `services/commerce-api/src/modules/fulfillment`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                             | Status / remaining dependency                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| Seller order queue                                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Order detail by seller lines                            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Accept/reject rules where applicable                    | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Seller fulfillment statuses                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Dispatch/tracking entry                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Cancellation handling                                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Returns visibility                                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Seller sees only authorized orders                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Seller actions update only its fulfillment scope        | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Customer order remains coherent across multiple sellers | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Status transitions are validated server-side            | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #38 — Add marketplace reviews, ratings and moderation

Source: https://github.com/Izyane-InovSolutions/commerce/issues/38

Implementation evidence: `services/commerce-api/src/modules/reviews`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                   | Status / remaining dependency                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Product reviews                                               | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Seller ratings                                                | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Verified-purchase marker                                      | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Review submission/edit policy                                 | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Moderation queue                                              | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Abuse/report action                                           | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Rating aggregates                                             | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Only eligible customers can review purchased items            | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Seller/product aggregates are recalculated consistently       | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Moderated/removed reviews are excluded from public aggregates | deferred — criterion-level verification; module presence alone is not acceptance evidence |
| Admin moderation is audited                                   | deferred — criterion-level verification; module presence alone is not acceptance evidence |

## #39 — Establish mobile app architecture and shared API client

Source: https://github.com/Izyane-InovSolutions/commerce/issues/39

Client implementation excluded. Verify compatibility of existing backend APIs when clients integrate; do not close this issue solely on backend evidence.

## #40 — Build mobile authentication and account experience

Source: https://github.com/Izyane-InovSolutions/commerce/issues/40

Client implementation excluded. Verify compatibility of existing backend APIs when clients integrate; do not close this issue solely on backend evidence.

## #41 — Build mobile discovery, categories, search and product pages

Source: https://github.com/Izyane-InovSolutions/commerce/issues/41

Client implementation excluded. Verify compatibility of existing backend APIs when clients integrate; do not close this issue solely on backend evidence.

## #42 — Implement mobile cart and checkout

Source: https://github.com/Izyane-InovSolutions/commerce/issues/42

Client implementation excluded. Verify compatibility of existing backend APIs when clients integrate; do not close this issue solely on backend evidence.

## #43 — Integrate mobile in-house payments and order status

Source: https://github.com/Izyane-InovSolutions/commerce/issues/43

Client implementation excluded. Verify compatibility of existing backend APIs when clients integrate; do not close this issue solely on backend evidence.

## #44 — Add push notifications, deep links and mobile release hardening

Source: https://github.com/Izyane-InovSolutions/commerce/issues/44

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                  | Status / remaining dependency                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Device token registration                                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Push notification service integration                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Order/payment/shipment notification events                   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Deep links from notifications                                | deferred — roadmap milestone; configuration/live adapters separately gated |
| App update/error handling                                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Crash/error reporting                                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Android/iOS release configuration                            | deferred — roadmap milestone; configuration/live adapters separately gated |
| Notification events originate from backend business events   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Deep links open the correct authenticated/public destination | deferred — roadmap milestone; configuration/live adapters separately gated |
| Device tokens can be revoked/rotated                         | deferred — roadmap milestone; configuration/live adapters separately gated |
| Production builds are reproducible                           | deferred — roadmap milestone; configuration/live adapters separately gated |

## #45 — Build promotions, coupons and pricing rules engine

Source: https://github.com/Izyane-InovSolutions/commerce/issues/45

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                     | Status / remaining dependency                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Promotion campaigns                                             | deferred — roadmap milestone; configuration/live adapters separately gated |
| Coupon codes                                                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Eligibility rules                                               | deferred — roadmap milestone; configuration/live adapters separately gated |
| Product/category/offer targeting                                | deferred — roadmap milestone; configuration/live adapters separately gated |
| Usage limits                                                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Start/end dates                                                 | deferred — roadmap milestone; configuration/live adapters separately gated |
| Discount calculation service                                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Audit/history                                                   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Promotion calculations occur server-side                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Rules are deterministic and tested                              | deferred — roadmap milestone; configuration/live adapters separately gated |
| Stacking/exclusion behavior is explicit                         | deferred — roadmap milestone; configuration/live adapters separately gated |
| Checkout shows applied discounts from backend-calculated totals | deferred — roadmap milestone; configuration/live adapters separately gated |

## #46 — Implement collections, merchandising and advanced search

Source: https://github.com/Izyane-InovSolutions/commerce/issues/46

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                       | Status / remaining dependency                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Curated collections                                               | deferred — roadmap milestone; configuration/live adapters separately gated |
| Featured products                                                 | deferred — roadmap milestone; configuration/live adapters separately gated |
| Search autocomplete/suggestions                                   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Faceted search                                                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Synonyms and typo-tolerant search foundation                      | deferred — roadmap milestone; configuration/live adapters separately gated |
| Sort/ranking controls                                             | deferred — roadmap milestone; configuration/live adapters separately gated |
| Search indexing pipeline                                          | deferred — roadmap milestone; configuration/live adapters separately gated |
| Merchandising can feature products without changing catalog truth | deferred — roadmap milestone; configuration/live adapters separately gated |
| Search remains backed by authoritative product/offer data         | deferred — roadmap milestone; configuration/live adapters separately gated |
| Index updates are resilient and observable                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Filters and autocomplete are fast and consistent                  | deferred — roadmap milestone; configuration/live adapters separately gated |

## #47 — Add loyalty, gift cards and customer retention foundations

Source: https://github.com/Izyane-InovSolutions/commerce/issues/47

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                          | Status / remaining dependency                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Loyalty account model                                | deferred — roadmap milestone; configuration/live adapters separately gated |
| Points earning/redemption rules                      | deferred — roadmap milestone; configuration/live adapters separately gated |
| Gift card issuance/activation/redemption             | deferred — roadmap milestone; configuration/live adapters separately gated |
| Balance ledger                                       | deferred — roadmap milestone; configuration/live adapters separately gated |
| Customer eligibility rules                           | deferred — roadmap milestone; configuration/live adapters separately gated |
| Order integration                                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Loyalty/gift card balances are ledger-backed         | deferred — roadmap milestone; configuration/live adapters separately gated |
| Redemption cannot exceed available balance           | deferred — roadmap milestone; configuration/live adapters separately gated |
| Refunds/reversals correctly restore or reverse value | deferred — roadmap milestone; configuration/live adapters separately gated |
| Transactions are auditable                           | deferred — roadmap milestone; configuration/live adapters separately gated |

## #48 — Build customer support and case management

Source: https://github.com/Izyane-InovSolutions/commerce/issues/48

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                                  | Status / remaining dependency                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Support tickets/cases                                                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Customer/order/product references                                            | deferred — roadmap milestone; configuration/live adapters separately gated |
| Status, priority and assignment                                              | deferred — roadmap milestone; configuration/live adapters separately gated |
| Internal/admin notes                                                         | deferred — roadmap milestone; configuration/live adapters separately gated |
| Customer-facing ticket history                                               | deferred — roadmap milestone; configuration/live adapters separately gated |
| Notification hooks                                                           | deferred — roadmap milestone; configuration/live adapters separately gated |
| Support agents can find orders and customers without exposing unrelated data | deferred — roadmap milestone; configuration/live adapters separately gated |
| Cases have clear lifecycle states                                            | deferred — roadmap milestone; configuration/live adapters separately gated |
| Customer and staff views are permission-separated                            | deferred — roadmap milestone; configuration/live adapters separately gated |
| Important actions are auditable                                              | deferred — roadmap milestone; configuration/live adapters separately gated |

## #49 — Add recommendations, recently viewed and commerce analytics

Source: https://github.com/Izyane-InovSolutions/commerce/issues/49

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                             | Status / remaining dependency                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| Recently viewed events                                  | deferred — roadmap milestone; configuration/live adapters separately gated |
| Recommendation service abstraction                      | deferred — roadmap milestone; configuration/live adapters separately gated |
| Frequently bought together foundation                   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Product/customer event tracking                         | deferred — roadmap milestone; configuration/live adapters separately gated |
| Retail vs marketplace analytics                         | deferred — roadmap milestone; configuration/live adapters separately gated |
| Funnel, conversion and order metrics                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Dashboard APIs                                          | deferred — roadmap milestone; configuration/live adapters separately gated |
| Recommendation failures never block checkout            | deferred — roadmap milestone; configuration/live adapters separately gated |
| Analytics distinguish retail and marketplace activity   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Event ingestion is asynchronous where appropriate       | deferred — roadmap milestone; configuration/live adapters separately gated |
| Dashboards use reproducible definitions for key metrics | deferred — roadmap milestone; configuration/live adapters separately gated |

## #50 — Build provider-agnostic courier and 3PL integration layer

Source: https://github.com/Izyane-InovSolutions/commerce/issues/50

Implementation evidence: `services/commerce-api/src/modules/shipments` has the provider interface, registry, webhook ingestion route and tracking poller; the only registered provider is `ManualCarrierProvider`, so no real courier/3PL is integrated yet.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                           | Status / remaining dependency                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| Carrier/3PL interface                                 | deferred — roadmap milestone; configuration/live adapters separately gated |
| Shipment booking                                      | deferred — roadmap milestone; configuration/live adapters separately gated |
| Tracking synchronization                              | deferred — roadmap milestone; configuration/live adapters separately gated |
| Delivery event ingestion                              | deferred — roadmap milestone; configuration/live adapters separately gated |
| Label/reference handling                              | deferred — roadmap milestone; configuration/live adapters separately gated |
| Provider credentials/configuration boundaries         | deferred — roadmap milestone; configuration/live adapters separately gated |
| Retry/reconciliation jobs                             | deferred — roadmap milestone; configuration/live adapters separately gated |
| Providers are replaceable behind an adapter interface | deferred — roadmap milestone; configuration/live adapters separately gated |
| Webhook/event handling is idempotent                  | deferred — roadmap milestone; configuration/live adapters separately gated |
| Provider failures do not corrupt order states         | deferred — roadmap milestone; configuration/live adapters separately gated |
| Operations can reconcile shipment discrepancies       | deferred — roadmap milestone; configuration/live adapters separately gated |

## #51 — Implement seller fulfillment programs and service levels

Source: https://github.com/Izyane-InovSolutions/commerce/issues/51

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                   | Status / remaining dependency                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Seller fulfillment configurations                             | deferred — roadmap milestone; configuration/live adapters separately gated |
| Platform-fulfilled vs seller-fulfilled modes                  | deferred — roadmap milestone; configuration/live adapters separately gated |
| Handling/dispatch SLAs                                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Cut-off times                                                 | deferred — roadmap milestone; configuration/live adapters separately gated |
| Fulfillment eligibility rules                                 | deferred — roadmap milestone; configuration/live adapters separately gated |
| Seller compliance monitoring                                  | deferred — roadmap milestone; configuration/live adapters separately gated |
| Fulfillment mode is explicit per offer/order line             | deferred — roadmap milestone; configuration/live adapters separately gated |
| SLA breaches are measurable                                   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Customer delivery estimates reflect fulfillment configuration | deferred — roadmap milestone; configuration/live adapters separately gated |
| Seller performance can be acted on by admins                  | deferred — roadmap milestone; configuration/live adapters separately gated |

## #52 — Add seller messaging, promotions and merchandising tools

Source: https://github.com/Izyane-InovSolutions/commerce/issues/52

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                            | Status / remaining dependency                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Seller/customer messaging foundation                   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Seller-specific promotions                             | deferred — roadmap milestone; configuration/live adapters separately gated |
| Offer discounts                                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Promotion approval rules                               | deferred — roadmap milestone; configuration/live adapters separately gated |
| Seller campaign management                             | deferred — roadmap milestone; configuration/live adapters separately gated |
| Moderation/reporting                                   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Messaging respects customer privacy and seller scope   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Seller promotions cannot bypass platform pricing rules | deferred — roadmap milestone; configuration/live adapters separately gated |
| Admin can suspend campaigns or messaging privileges    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Promotional activity is auditable                      | deferred — roadmap milestone; configuration/live adapters separately gated |

## #53 — Establish sponsored products and advertising foundations

Source: https://github.com/Izyane-InovSolutions/commerce/issues/53

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                       | Status / remaining dependency                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Advertising campaign model                                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Sponsored offer/product placements                                | deferred — roadmap milestone; configuration/live adapters separately gated |
| Budget and schedule primitives                                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Ad eligibility                                                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Impression/click/conversion event model                           | deferred — roadmap milestone; configuration/live adapters separately gated |
| Admin controls and reporting                                      | deferred — roadmap milestone; configuration/live adapters separately gated |
| Sponsored content is clearly distinguishable from organic results | deferred — roadmap milestone; configuration/live adapters separately gated |
| Budget/schedule constraints are enforced server-side              | deferred — roadmap milestone; configuration/live adapters separately gated |
| Advertising events do not alter transactional totals              | deferred — roadmap milestone; configuration/live adapters separately gated |
| Organic ranking remains independently testable                    | deferred — roadmap milestone; configuration/live adapters separately gated |

## #54 — Build advanced seller analytics and performance controls

Source: https://github.com/Izyane-InovSolutions/commerce/issues/54

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                           | Status / remaining dependency                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| Sales/revenue analytics                               | deferred — roadmap milestone; configuration/live adapters separately gated |
| Order/fulfillment metrics                             | deferred — roadmap milestone; configuration/live adapters separately gated |
| Cancellation/return rates                             | deferred — roadmap milestone; configuration/live adapters separately gated |
| Customer rating metrics                               | deferred — roadmap milestone; configuration/live adapters separately gated |
| SLA/performance scorecards                            | deferred — roadmap milestone; configuration/live adapters separately gated |
| Seller warnings, holds and suspension thresholds      | deferred — roadmap milestone; configuration/live adapters separately gated |
| Exportable reports                                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Metrics are scoped correctly to each seller           | deferred — roadmap milestone; configuration/live adapters separately gated |
| Performance calculations have documented definitions  | deferred — roadmap milestone; configuration/live adapters separately gated |
| Admin actions can be triggered from policy thresholds | deferred — roadmap milestone; configuration/live adapters separately gated |
| Analytics do not alter transactional records          | deferred — roadmap milestone; configuration/live adapters separately gated |

## #55 — Implement offer ranking and Buy Box engine

Source: https://github.com/Izyane-InovSolutions/commerce/issues/55

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                  | Status / remaining dependency                                               |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Offer eligibility checks                     | deferred — roadmap milestone; configuration/live adapters separately gated |
| Price/shipping/stock/rating signals          | deferred — roadmap milestone; configuration/live adapters separately gated |
| Buy Box selection service                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Explainable ranking breakdown                | deferred — roadmap milestone; configuration/live adapters separately gated |
| Manual/admin overrides where needed          | deferred — roadmap milestone; configuration/live adapters separately gated |
| Ranking audit history                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Ineligible offers never win the Buy Box      | deferred — roadmap milestone; configuration/live adapters separately gated |
| Ranking is deterministic for the same inputs | deferred — roadmap milestone; configuration/live adapters separately gated |
| Ranking factors are observable and auditable | deferred — roadmap milestone; configuration/live adapters separately gated |
| Product pages can show alternative offers    | deferred — roadmap milestone; configuration/live adapters separately gated |

## #56 — Implement Make an Offer and counter-offer workflows

Source: https://github.com/Izyane-InovSolutions/commerce/issues/56

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                   | Status / remaining dependency                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Offer negotiation entities                                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Buyer offer submission                                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Seller accept/reject/counter                                  | deferred — roadmap milestone; configuration/live adapters separately gated |
| Expiry and timeout rules                                      | deferred — roadmap milestone; configuration/live adapters separately gated |
| Price locking on acceptance                                   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Conversion to standard checkout/order                         | deferred — roadmap milestone; configuration/live adapters separately gated |
| Only valid active offers can be negotiated                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Negotiated price is immutable once accepted                   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Expired/rejected offers cannot be fulfilled                   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Accepted negotiations enter the normal order/payment workflow | deferred — roadmap milestone; configuration/live adapters separately gated |

## #57 — Build auction listings, bidding and settlement

Source: https://github.com/Izyane-InovSolutions/commerce/issues/57

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                      | Status / remaining dependency                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Auction listing model                                            | deferred — roadmap milestone; configuration/live adapters separately gated |
| Start/end times                                                  | deferred — roadmap milestone; configuration/live adapters separately gated |
| Minimum bid/reserve price                                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Bid placement and validation                                     | deferred — roadmap milestone; configuration/live adapters separately gated |
| Bid history                                                      | deferred — roadmap milestone; configuration/live adapters separately gated |
| Winner selection                                                 | deferred — roadmap milestone; configuration/live adapters separately gated |
| Auction settlement and order creation                            | deferred — roadmap milestone; configuration/live adapters separately gated |
| Bid notifications                                                | deferred — roadmap milestone; configuration/live adapters separately gated |
| Bids are validated atomically and cannot bypass auction rules    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Closed auctions have one authoritative winner or no-sale outcome | deferred — roadmap milestone; configuration/live adapters separately gated |
| Winning bids convert to standard order/payment workflows         | deferred — roadmap milestone; configuration/live adapters separately gated |
| Bid history is immutable and auditable                           | deferred — roadmap milestone; configuration/live adapters separately gated |

## #58 — Establish dynamic pricing and price experimentation foundations

Source: https://github.com/Izyane-InovSolutions/commerce/issues/58

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                               | Status / remaining dependency                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| Dynamic pricing rules                                     | deferred — roadmap milestone; configuration/live adapters separately gated |
| Price schedules                                           | deferred — roadmap milestone; configuration/live adapters separately gated |
| Customer/segment eligibility hooks                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Price snapshots at checkout                               | deferred — roadmap milestone; configuration/live adapters separately gated |
| Approval/audit controls                                   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Pricing simulation API                                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Final transaction price is always snapshotted server-side | deferred — roadmap milestone; configuration/live adapters separately gated |
| Pricing rules are deterministic and auditable             | deferred — roadmap milestone; configuration/live adapters separately gated |
| Expired pricing cannot be applied                         | deferred — roadmap milestone; configuration/live adapters separately gated |
| Simulation does not mutate live prices                    | deferred — roadmap milestone; configuration/live adapters separately gated |

## #59 — Integrate advanced recommendations, AI and personalization services

Source: https://github.com/Izyane-InovSolutions/commerce/issues/59

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                  | Status / remaining dependency                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Recommendation service adapters                              | deferred — roadmap milestone; configuration/live adapters separately gated |
| Personalized home/product feeds                              | deferred — roadmap milestone; configuration/live adapters separately gated |
| Ranking feature pipeline                                     | deferred — roadmap milestone; configuration/live adapters separately gated |
| Embedding/vector-search integration point                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Explainability/feature logging                               | deferred — roadmap milestone; configuration/live adapters separately gated |
| Fallback strategies                                          | deferred — roadmap milestone; configuration/live adapters separately gated |
| AI/recommendation failures never block shopping or checkout  | deferred — roadmap milestone; configuration/live adapters separately gated |
| Recommendation inputs/outputs are observable                 | deferred — roadmap milestone; configuration/live adapters separately gated |
| Transactional systems remain authoritative                   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Personalization can be disabled or rolled back independently | deferred — roadmap milestone; configuration/live adapters separately gated |

## #60 — Implement advanced fraud controls and experimentation

Source: https://github.com/Izyane-InovSolutions/commerce/issues/60

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                     | Status / remaining dependency                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Risk scoring service interface                                  | deferred — roadmap milestone; configuration/live adapters separately gated |
| Transaction/seller/customer risk signals                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Holds/manual review                                             | deferred — roadmap milestone; configuration/live adapters separately gated |
| Suspicious bid/payment/order detection hooks                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Feature flags and A/B experiments                               | deferred — roadmap milestone; configuration/live adapters separately gated |
| Experiment assignment and exposure tracking                     | deferred — roadmap milestone; configuration/live adapters separately gated |
| Rollback controls                                               | deferred — roadmap milestone; configuration/live adapters separately gated |
| High-risk activity can be held before fulfillment/payout        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Risk decisions are explainable and auditable                    | deferred — roadmap milestone; configuration/live adapters separately gated |
| Experiments can be enabled for scoped cohorts                   | deferred — roadmap milestone; configuration/live adapters separately gated |
| Experiment failures can be disabled without redeployment        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Risk/experiment services cannot directly mutate financial truth | deferred — roadmap milestone; configuration/live adapters separately gated |

## #61 — Automate seller payouts and strengthen marketplace risk controls

Source: https://github.com/Izyane-InovSolutions/commerce/issues/61

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                      | Status / remaining dependency                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Scheduled payout jobs                                            | deferred — roadmap milestone; configuration/live adapters separately gated |
| Payout eligibility checks                                        | deferred — roadmap milestone; configuration/live adapters separately gated |
| Holds/reserve periods                                            | deferred — roadmap milestone; configuration/live adapters separately gated |
| Retry and reconciliation workflow                                | deferred — roadmap milestone; configuration/live adapters separately gated |
| Marketplace risk checks before payout                            | deferred — roadmap milestone; configuration/live adapters separately gated |
| Manual review/override controls                                  | deferred — roadmap milestone; configuration/live adapters separately gated |
| Payout operational dashboard                                     | deferred — roadmap milestone; configuration/live adapters separately gated |
| Automated payouts are idempotent and reconciliation-safe         | deferred — roadmap milestone; configuration/live adapters separately gated |
| Risk/hold rules can prevent payout without altering ledger truth | deferred — roadmap milestone; configuration/live adapters separately gated |
| Every payout has a complete audit trail                          | deferred — roadmap milestone; configuration/live adapters separately gated |
| Failed batches can be resumed without duplicate settlement       | deferred — roadmap milestone; configuration/live adapters separately gated |

## Execution log

Historical checkpoints below preserve their original terminology, claims and dates. They do not override the current baseline above; in particular, auth reset delivery is now implemented in source.

- Baseline audit: seven confirmed current-scope gaps (test isolation, uncertain payout outcomes, reconciliation races, batch recovery, paid-balance backfill, fulfillment version, deferred reset delivery).
- Previously observed unit baseline: 70 suites / 661 tests. Not proof of integration or deployment acceptance.
- No issues are closed automatically by this matrix.

### Stabilization implementation — 2026-09-19

| Requirement | Implementation and test evidence | Current status |
| --- | --- | --- |
| Fail-closed test database selection | `infrastructure/config/integration-test.config.ts` and its unit spec; `test/setup-integration-env.ts`; `test/prepare-integration-database.ts` | Verified configuration rejection; migrations/integration run externally blocked by missing dedicated test database |
| Test-owned cleanup and scheduler isolation | Scoped refund/batch cleanup in integration fixtures; `infrastructure/jobs/jobs.module.ts`; test setup files | Implemented; PostgreSQL cleanup verification pending |
| Unknown payout outcomes must not become retryable failures | `payouts.service.ts`; `payouts.service.spec.ts`; `test/payouts.integration-spec.ts` | Unit verified; PostgreSQL rollback test added but not executed |
| Atomic manual reconciliation and safe batch recovery | `payouts.service.ts`; `payout-processing.service.spec.ts`; concurrency cases in `test/payouts.integration-spec.ts` | Unit verified; database concurrency verification pending |
| Historical paid totals and read-only integrity reporting | Migration `20260919130000_backfill_paid_balances`; `ledger.service.ts`; `ledger-integrity.spec.ts`; security E2E | Unit/API authorization verified; migration not applied or database-verified |
| Seller fulfillment concurrency token and typed operations | `orders/seller-orders.service.ts`; `packages/contracts/src/seller-operations.ts`; `packages/api-client/src/backend/seller-fulfillment.ts`; corresponding contract/client tests; seller fulfillment HTTP integration test | Contracts/client unit verified; real HTTP/PostgreSQL flow pending |
| Remaining #37/#38 acceptance audit and broader roadmap | Criterion baseline above | Not complete; releases 2–4 are not implemented by this stabilization change |

Verification: 74 backend unit suites / 679 tests; 8 fake-database HTTP E2E suites / 30 tests; 21 contracts tests; 31 client tests passed. API lint, API build, backend/shared-package typechecks, OpenAPI check (251 endpoints / 311 schemas) and Prisma schema validation passed. The complete workspace typecheck still reports admin-app route-type errors in `apps/admin/src/app/orders/[id]/page.tsx`; frontend code was not changed.

At the 2026-09-19 checkpoint, the integration command correctly stopped before connecting because `TEST_DATABASE_URL` / `TEST_DATABASE_NAME` were absent. No application database migrations, backfills, deployments, commits, pushes or issue closures had been performed at that checkpoint. The following checkpoint supersedes its database-verification blockers.

### Local database verification and review integration - 2026-09-20

The user explicitly confirmed that the local application database `commerce` is disposable. Added an explicit `INTEGRATION_DATABASE_MODE=disposable-development` opt-in with exact-name confirmation, loopback-host restrictions and production rejection. Default test configuration remains fail-closed; there is no automatic application-database fallback. See `backend-release-1-verification.md` for commands.

| Requirement | Evidence | Current status |
| --- | --- | --- |
| Payout unknown outcomes, reconciliation concurrency and recoverable batches | All payout PostgreSQL/HTTP suites passed as part of 11 suites / 53 integration tests | Locally verified; live provider and staging gates remain |
| Historical paid totals | Corrective migration applied successfully; all 31 migrations up to date | Migration execution verified locally; representative historical migration fixtures and operational financial reconciliation remain separate gates |
| Seller fulfillment version/client flow | Seller fulfillment PostgreSQL and HTTP suites passed; shared contracts/client tests passed | Locally verified; complete criterion-level acceptance audit remains pending |
| Review runtime schemas and typed API clients | `packages/contracts/src/reviews.ts`, `packages/api-client/src/backend/reviews.ts` and corresponding tests | Verified public/customer/seller/admin routes, pagination, sensitive-field projections and replay-key forwarding |
| Review Boolean filters | `common/pagination/boolean-query.transform.ts`, `modules/reviews/review-query.spec.ts`, `test/reviews-http.integration-spec.ts` | Unit and real HTTP verification: false remains false, malformed values rejected, seller cannot access admin queue |
| Rating aggregate integrity | `scripts/rebuild-review-summaries.ts --check` | Read-only check passed on local database; rebuild/replay operational rehearsal still pending |

Current verification: 75 backend unit suites / 692 tests; 11 PostgreSQL integration suites / 53 tests; 8 fake-database HTTP E2E suites / 30 tests; 31 contracts tests; 56 API-client tests passed. The review HTTP suite was rerun successfully after adding Boolean-filter and authorization assertions. API build, lint and OpenAPI consistency (251 endpoints / 311 schemas) passed. No frontend changes, staging deployment, commit, push or issue closure was performed. Earlier workspace-wide frontend typecheck failures remain outside this backend-only change.

This does not certify the whole backend plan complete. Full acceptance mapping, payout lifecycle shared-client coverage, migration-history verification, staging/backup recovery and releases 2-4 remain outstanding. Password-reset delivery and payment hardening remain explicitly deferred.
