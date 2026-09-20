# Backend acceptance matrix

This is the implementation baseline, not a completion certificate. Source: README development phases and GitHub issues #1–#61. Frontend/mobile UI requirements are excluded from backend delivery. Existing code references are candidate evidence until each acceptance criterion has been verified. Tests must run against an isolated database.

Statuses: implemented (verification pending), verified (record exact evidence), externally blocked, deferred. Later releases are deferred until their milestone starts, not declared complete. Password-reset delivery and payment hardening remain deliberately deferred. Live notification/carrier/payment/AI providers require separate activation evidence.

## README cross-cutting requirements

| Requirement                                                              | Evidence                                                      | Status / remaining gate                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Modular monolith; PostgreSQL authority; shared API                       | services/commerce-api/src/app.module.ts; prisma/schema.prisma | Implemented; boundary and API acceptance audit pending                  |
| Server prices, immutable order snapshots, atomic stock, verified payment | checkout, inventory, orders, payments modules                 | Implemented; financial integration/hardening deferred                   |
| Auth, ownership, audit, PII, idempotency                                 | common/auth; auth/audit modules; infrastructure/logging       | Implemented; endpoint-by-endpoint negative-path audit pending           |
| Background jobs and outbox                                               | infrastructure/jobs                                           | Implemented; crash/replay tests and operational evidence pending        |
| Email/SMS/push/in-app notifications                                      | No delivery module yet                                        | Deferred; password-reset delivery explicitly deferred                   |
| Search and rebuildable projections                                       | products module; reviews aggregate script                     | Partial; advanced indexing/rebuild verification pending                 |
| Logging, metrics, tracing, errors, health                                | infrastructure/logging; infrastructure/metrics; health        | Partial; tracing/error reporting and deployment verification pending    |
| Environments, CI/CD, secrets, backup/restore, storage                    | docs/backend-development.md; infrastructure/storage           | Release operations and restore evidence pending; do not assume deployed |
| No frontend/mobile screen work                                           | apps/\* excluded                                              | Scope boundary                                                          |

## #9 — Establish repository and monorepo structure

Source: https://github.com/Izyane-InovSolutions/commerce/issues/9

Implementation evidence: `package.json`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                                                                | Status / remaining dependency                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Establish the monorepo structure using `apps/` and `services/`                                                             | Verification pending; existing module alone is not acceptance evidence |
| Create application boundaries for web, admin, seller and mobile clients                                                    | Verification pending; existing module alone is not acceptance evidence |
| Create `services/commerce-api` as the single deployable NestJS modular monolith                                            | Verification pending; existing module alone is not acceptance evidence |
| Establish shared `packages/`, `docs/` and infrastructure locations as appropriate                                          | Verification pending; existing module alone is not acceptance evidence |
| Add formatting, linting, editor and Git conventions                                                                        | Verification pending; existing module alone is not acceptance evidence |
| Add `.env.example` files without secrets                                                                                   | Verification pending; existing module alone is not acceptance evidence |
| Add contribution/development workflow documentation                                                                        | Verification pending; existing module alone is not acceptance evidence |
| Define naming conventions for API routes, database migrations and shared contracts                                         | Verification pending; existing module alone is not acceptance evidence |
| A new developer can clone the repository and understand where every application and service belongs                        | Verification pending; existing module alone is not acceptance evidence |
| Web, admin, seller, mobile and Commerce API have independent build/test commands                                           | Verification pending; existing module alone is not acceptance evidence |
| `services/commerce-api` clearly separates business modules from common, database, integrations and infrastructure concerns | Verification pending; existing module alone is not acceptance evidence |
| Shared contracts can be versioned without importing backend implementation details into clients                            | Verification pending; existing module alone is not acceptance evidence |
| No credentials or environment-specific secrets are committed                                                               | Verification pending; existing module alone is not acceptance evidence |
| Repository conventions are documented                                                                                      | Verification pending; existing module alone is not acceptance evidence |

## #10 — Bootstrap NestJS Commerce API

Source: https://github.com/Izyane-InovSolutions/commerce/issues/10

Implementation evidence: `services/commerce-api/src/app.module.ts`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                            | Status / remaining dependency                                          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Bootstrap NestJS application under `services/commerce-api`                             | Verification pending; existing module alone is not acceptance evidence |
| Establish `src/modules/` as the business-module boundary                               | Verification pending; existing module alone is not acceptance evidence |
| Establish `/api/v1` routing                                                            | Verification pending; existing module alone is not acceptance evidence |
| Health/readiness endpoints                                                             | Verification pending; existing module alone is not acceptance evidence |
| Configuration loading and validation                                                   | Verification pending; existing module alone is not acceptance evidence |
| Structured request/response models and DTOs                                            | Verification pending; existing module alone is not acceptance evidence |
| Standard success/error envelope                                                        | Verification pending; existing module alone is not acceptance evidence |
| Request ID and correlation ID middleware/interceptors                                  | Verification pending; existing module alone is not acceptance evidence |
| Global validation and exception handling                                               | Verification pending; existing module alone is not acceptance evidence |
| Graceful shutdown                                                                      | Verification pending; existing module alone is not acceptance evidence |
| API documentation baseline                                                             | Verification pending; existing module alone is not acceptance evidence |
| API starts cleanly from a documented command                                           | Verification pending; existing module alone is not acceptance evidence |
| `/api/v1/health` and readiness checks work                                             | Verification pending; existing module alone is not acceptance evidence |
| Invalid configuration fails fast with actionable errors                                | Verification pending; existing module alone is not acceptance evidence |
| All client-facing errors use a consistent schema                                       | Verification pending; existing module alone is not acceptance evidence |
| Global validation is enabled                                                           | Verification pending; existing module alone is not acceptance evidence |
| Modules follow NestJS dependency-injection and module-boundary conventions             | Verification pending; existing module alone is not acceptance evidence |
| Modules do not directly access another module's repositories                           | Verification pending; existing module alone is not acceptance evidence |
| Middleware/interceptors/guards follow the established common/infrastructure boundaries | Verification pending; existing module alone is not acceptance evidence |

## #11 — Build PostgreSQL + Prisma schema and migration foundation

Source: https://github.com/Izyane-InovSolutions/commerce/issues/11

Implementation evidence: `services/commerce-api/prisma`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                                               | Status / remaining dependency                                          |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| PostgreSQL connection and pooling through the NestJS data layer                                           | Verification pending; existing module alone is not acceptance evidence |
| Prisma schema configuration and generated client                                                          | Verification pending; existing module alone is not acceptance evidence |
| Prisma migration tooling and baseline migration                                                           | Verification pending; existing module alone is not acceptance evidence |
| UUID/public identifier strategy                                                                           | Verification pending; existing module alone is not acceptance evidence |
| Timestamp, soft-delete and audit conventions where appropriate                                            | Verification pending; existing module alone is not acceptance evidence |
| Initial schemas for users, roles, products, SKUs/variants and core commerce references                    | Verification pending; existing module alone is not acceptance evidence |
| Foreign-key, index and unique-constraint standards                                                        | Verification pending; existing module alone is not acceptance evidence |
| Transaction boundaries and Prisma transaction guidance                                                    | Verification pending; existing module alone is not acceptance evidence |
| Repository/data-access boundaries so modules do not directly couple to each other's persistence internals | Verification pending; existing module alone is not acceptance evidence |
| Fresh database can be created from Prisma migrations only                                                 | Verification pending; existing module alone is not acceptance evidence |
| Migrations are deterministic and tracked in source control                                                | Verification pending; existing module alone is not acceptance evidence |
| Prisma client generation is documented and reproducible                                                   | Verification pending; existing module alone is not acceptance evidence |
| Core tables have appropriate keys and indexes                                                             | Verification pending; existing module alone is not acceptance evidence |
| Database conventions are documented                                                                       | Verification pending; existing module alone is not acceptance evidence |
| NestJS integration tests can run against a clean database                                                 | Verification pending; existing module alone is not acceptance evidence |
| Module persistence boundaries are explicit                                                                | Verification pending; existing module alone is not acceptance evidence |

## #12 — Implement authentication, sessions and RBAC

Source: https://github.com/Izyane-InovSolutions/commerce/issues/12

Implementation evidence: `services/commerce-api/src/modules/auth`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                         | Status / remaining dependency                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Registration/login/logout flows                                     | Verification pending; existing module alone is not acceptance evidence |
| Password hashing and reset                                          | Verification pending; existing module alone is not acceptance evidence |
| Access/refresh token or secure session strategy                     | Verification pending; existing module alone is not acceptance evidence |
| NestJS AuthModule and UsersModule boundaries                        | Verification pending; existing module alone is not acceptance evidence |
| Role and permission model                                           | Verification pending; existing module alone is not acceptance evidence |
| Customer, seller, staff and admin authorization boundaries          | Verification pending; existing module alone is not acceptance evidence |
| Guards, decorators and ownership checks                             | Verification pending; existing module alone is not acceptance evidence |
| Session/token revocation                                            | Verification pending; existing module alone is not acceptance evidence |
| Rate limiting for sensitive auth endpoints                          | Verification pending; existing module alone is not acceptance evidence |
| Protected endpoints reject unauthenticated requests                 | Verification pending; existing module alone is not acceptance evidence |
| Users cannot access resources outside their role or ownership scope | Verification pending; existing module alone is not acceptance evidence |
| Passwords are never stored in plaintext                             | Verification pending; existing module alone is not acceptance evidence |
| Refresh/revocation behavior is tested                               | Verification pending; existing module alone is not acceptance evidence |
| NestJS guards/decorators provide reusable authorization primitives  | Verification pending; existing module alone is not acceptance evidence |
| Authorization rules are reusable by web and mobile clients          | Verification pending; existing module alone is not acceptance evidence |

## #13 — Add Redis caching and background job foundation

Source: https://github.com/Izyane-InovSolutions/commerce/issues/13

Implementation evidence: `services/commerce-api/src/infrastructure`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                            | Status / remaining dependency                                          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Redis connection/configuration under `src/infrastructure`                              | Verification pending; existing module alone is not acceptance evidence |
| Cache abstraction with TTL support                                                     | Verification pending; existing module alone is not acceptance evidence |
| Rate-limit primitives for NestJS                                                       | Verification pending; existing module alone is not acceptance evidence |
| Background job queue/worker foundation                                                 | Verification pending; existing module alone is not acceptance evidence |
| Retry and dead-letter strategy                                                         | Verification pending; existing module alone is not acceptance evidence |
| Job observability and failure logging                                                  | Verification pending; existing module alone is not acceptance evidence |
| Dependency-injection interfaces so domain modules do not depend directly on Redis APIs | Verification pending; existing module alone is not acceptance evidence |
| NestJS modules can use Redis through an application/infrastructure abstraction         | Verification pending; existing module alone is not acceptance evidence |
| Jobs survive transient failures through controlled retries                             | Verification pending; existing module alone is not acceptance evidence |
| Failed jobs are observable and do not loop indefinitely                                | Verification pending; existing module alone is not acceptance evidence |
| Local development includes Redis and documented commands                               | Verification pending; existing module alone is not acceptance evidence |
| Redis infrastructure can be changed without rewriting domain modules                   | Verification pending; existing module alone is not acceptance evidence |

## #14 — Establish observability, audit logging and security baseline

Source: https://github.com/Izyane-InovSolutions/commerce/issues/14

Implementation evidence: `services/commerce-api/src/infrastructure`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                        | Status / remaining dependency                                          |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Structured application logging for NestJS                                          | Verification pending; existing module alone is not acceptance evidence |
| Error tracking and alerting hooks                                                  | Verification pending; existing module alone is not acceptance evidence |
| Request correlation across API requests and background jobs                        | Verification pending; existing module alone is not acceptance evidence |
| Audit event model for privileged/business-critical actions                         | Verification pending; existing module alone is not acceptance evidence |
| Security headers and secure defaults                                               | Verification pending; existing module alone is not acceptance evidence |
| Centralized validation and exception handling                                      | Verification pending; existing module alone is not acceptance evidence |
| PII/log redaction policy                                                           | Verification pending; existing module alone is not acceptance evidence |
| Basic metrics for API latency, errors and background jobs                          | Verification pending; existing module alone is not acceptance evidence |
| Every API request has a traceable request ID                                       | Verification pending; existing module alone is not acceptance evidence |
| Sensitive values are excluded from logs                                            | Verification pending; existing module alone is not acceptance evidence |
| Admin/security-sensitive actions create audit events                               | Verification pending; existing module alone is not acceptance evidence |
| Errors can be correlated to requests/jobs                                          | Verification pending; existing module alone is not acceptance evidence |
| Operational runbooks document common failure modes                                 | Verification pending; existing module alone is not acceptance evidence |
| Logging, interceptors, filters and metrics respect the modular monolith boundaries | Verification pending; existing module alone is not acceptance evidence |

## #15 — Define object storage and media pipeline

Source: https://github.com/Izyane-InovSolutions/commerce/issues/15

Implementation evidence: `services/commerce-api/src/modules/media`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                | Status / remaining dependency                                          |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Object storage abstraction under `src/infrastructure` / `src/integrations` | Verification pending; existing module alone is not acceptance evidence |
| Signed upload/download URLs                                                | Verification pending; existing module alone is not acceptance evidence |
| Media metadata model and persistence through the appropriate domain module | Verification pending; existing module alone is not acceptance evidence |
| Image validation and size limits                                           | Verification pending; existing module alone is not acceptance evidence |
| Thumbnail/variant processing hook                                          | Verification pending; existing module alone is not acceptance evidence |
| Orphan cleanup strategy                                                    | Verification pending; existing module alone is not acceptance evidence |
| Dependency-injection interface for storage providers                       | Verification pending; existing module alone is not acceptance evidence |
| Clients never receive storage credentials                                  | Verification pending; existing module alone is not acceptance evidence |
| Uploads are validated and associated with authorized resources             | Verification pending; existing module alone is not acceptance evidence |
| Storage provider can be changed behind an abstraction                      | Verification pending; existing module alone is not acceptance evidence |
| Media lifecycle is auditable                                               | Verification pending; existing module alone is not acceptance evidence |
| Domain modules do not directly depend on provider-specific SDK details     | Verification pending; existing module alone is not acceptance evidence |

## #16 — Define in-house payment gateway integration contract

Source: https://github.com/Izyane-InovSolutions/commerce/issues/16

Implementation evidence: `services/commerce-api/src/modules/payments`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                                           | Status / remaining dependency                                          |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Payment provider interface under `src/modules/payments` and adapter boundary under `src/integrations` | Verification pending; existing module alone is not acceptance evidence |
| Payment initialization/status/verification operations                                                 | Verification pending; existing module alone is not acceptance evidence |
| Webhook/callback contract                                                                             | Verification pending; existing module alone is not acceptance evidence |
| Idempotency requirements                                                                              | Verification pending; existing module alone is not acceptance evidence |
| Refund interface                                                                                      | Verification pending; existing module alone is not acceptance evidence |
| Payment state machine                                                                                 | Verification pending; existing module alone is not acceptance evidence |
| Gateway event persistence model                                                                       | Verification pending; existing module alone is not acceptance evidence |
| Failure, timeout and reconciliation rules                                                             | Verification pending; existing module alone is not acceptance evidence |
| NestJS dependency-injection contract between PaymentsModule and the gateway adapter                   | Verification pending; existing module alone is not acceptance evidence |
| Payments domain does not depend on gateway-specific payloads                                          | Verification pending; existing module alone is not acceptance evidence |
| Duplicate callbacks cannot duplicate payment/order effects                                            | Verification pending; existing module alone is not acceptance evidence |
| Payment states and transitions are documented                                                         | Verification pending; existing module alone is not acceptance evidence |
| Refunds and failures have explicit states                                                             | Verification pending; existing module alone is not acceptance evidence |
| A sandbox/mock provider can be used in automated tests                                                | Verification pending; existing module alone is not acceptance evidence |
| Gateway-specific SDK/API code is isolated under the integration boundary                              | Verification pending; existing module alone is not acceptance evidence |

## #17 — Implement catalog, categories and product data APIs

Source: https://github.com/Izyane-InovSolutions/commerce/issues/17

Implementation evidence: `services/commerce-api/src/modules/products`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                               | Status / remaining dependency                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Categories and category hierarchy                         | Verification pending; existing module alone is not acceptance evidence |
| Brands and attributes                                     | Verification pending; existing module alone is not acceptance evidence |
| Products, variants/SKUs and media                         | Verification pending; existing module alone is not acceptance evidence |
| Product status/publishing workflow                        | Verification pending; existing module alone is not acceptance evidence |
| Pricing references                                        | Verification pending; existing module alone is not acceptance evidence |
| Public catalog endpoints                                  | Verification pending; existing module alone is not acceptance evidence |
| Pagination and basic caching                              | Verification pending; existing module alone is not acceptance evidence |
| Published products are retrievable through versioned APIs | Verification pending; existing module alone is not acceptance evidence |
| Variant/SKU data is explicit and consistent               | Verification pending; existing module alone is not acceptance evidence |
| Unpublished products are hidden from public APIs          | Verification pending; existing module alone is not acceptance evidence |
| Product model can later have multiple seller offers       | Verification pending; existing module alone is not acceptance evidence |

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
| Customer profile APIs/UI                                  | Verification pending; existing module alone is not acceptance evidence |
| Address book                                              | Verification pending; existing module alone is not acceptance evidence |
| Cart creation/update/remove                               | Verification pending; existing module alone is not acceptance evidence |
| Cart validation against current prices and stock          | Verification pending; existing module alone is not acceptance evidence |
| Wishlist                                                  | Verification pending; existing module alone is not acceptance evidence |
| Guest-to-account cart merge                               | Verification pending; existing module alone is not acceptance evidence |
| Cart is persisted server-side for authenticated customers | Verification pending; existing module alone is not acceptance evidence |
| Invalid quantity/stock is rejected by the backend         | Verification pending; existing module alone is not acceptance evidence |
| Price changes are revalidated before checkout             | Verification pending; existing module alone is not acceptance evidence |
| Wishlist and addresses are protected by ownership rules   | Verification pending; existing module alone is not acceptance evidence |

## #22 — Implement checkout, order creation and in-house payment flow

Source: https://github.com/Izyane-InovSolutions/commerce/issues/22

Implementation evidence: `services/commerce-api/src/modules/checkout`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                 | Status / remaining dependency                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Checkout validation and pricing snapshot                    | Verification pending; existing module alone is not acceptance evidence |
| Customer address/shipping selection                         | Verification pending; existing module alone is not acceptance evidence |
| Order creation with immutable line-item snapshots           | Verification pending; existing module alone is not acceptance evidence |
| Payment attempt creation                                    | Verification pending; existing module alone is not acceptance evidence |
| In-house gateway initialization                             | Verification pending; existing module alone is not acceptance evidence |
| Callback/webhook verification                               | Verification pending; existing module alone is not acceptance evidence |
| Idempotent payment handling                                 | Verification pending; existing module alone is not acceptance evidence |
| Order confirmation after verified payment                   | Verification pending; existing module alone is not acceptance evidence |
| Client cannot mark an order as paid                         | Verification pending; existing module alone is not acceptance evidence |
| Payment is confirmed only by trusted backend verification   | Verification pending; existing module alone is not acceptance evidence |
| Duplicate callbacks are harmless                            | Verification pending; existing module alone is not acceptance evidence |
| Failed/expired payments leave clear order/payment states    | Verification pending; existing module alone is not acceptance evidence |
| Successful payment produces a customer-visible confirmation | Verification pending; existing module alone is not acceptance evidence |

## #23 — Build customer orders, history and status UI

Source: https://github.com/Izyane-InovSolutions/commerce/issues/23

Client implementation excluded. Verify compatibility of existing backend APIs when clients integrate; do not close this issue solely on backend evidence.

## #24 — Add retail storefront testing and release hardening

Source: https://github.com/Izyane-InovSolutions/commerce/issues/24

Implementation evidence: `services/commerce-api/test`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                          | Status / remaining dependency                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Unit tests for pricing/cart/checkout rules           | Verification pending; existing module alone is not acceptance evidence |
| API integration tests                                | Verification pending; existing module alone is not acceptance evidence |
| Payment callback/idempotency tests                   | Verification pending; existing module alone is not acceptance evidence |
| End-to-end customer purchase flow                    | Verification pending; existing module alone is not acceptance evidence |
| Responsive/accessibility checks                      | Verification pending; existing module alone is not acceptance evidence |
| Performance checks for key public pages              | Verification pending; existing module alone is not acceptance evidence |
| Production configuration checklist                   | Verification pending; existing module alone is not acceptance evidence |
| Critical purchase paths are automated                | Verification pending; existing module alone is not acceptance evidence |
| Payment failures and duplicate callbacks are covered | Verification pending; existing module alone is not acceptance evidence |
| No critical responsive/accessibility issues remain   | Verification pending; existing module alone is not acceptance evidence |
| Production release checklist is documented           | Verification pending; existing module alone is not acceptance evidence |

## #25 — Implement warehouses and inventory model

Source: https://github.com/Izyane-InovSolutions/commerce/issues/25

Implementation evidence: `services/commerce-api/src/modules/inventory`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                       | Status / remaining dependency                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Warehouses and locations                                          | Verification pending; existing module alone is not acceptance evidence |
| SKUs and stock records                                            | Verification pending; existing module alone is not acceptance evidence |
| Available/reserved/committed quantities                           | Verification pending; existing module alone is not acceptance evidence |
| Stock adjustments                                                 | Verification pending; existing module alone is not acceptance evidence |
| Inventory API and admin views                                     | Verification pending; existing module alone is not acceptance evidence |
| Low-stock thresholds                                              | Verification pending; existing module alone is not acceptance evidence |
| Stock cannot become negative through normal order flows           | Verification pending; existing module alone is not acceptance evidence |
| Inventory quantities are separated by state                       | Verification pending; existing module alone is not acceptance evidence |
| Every adjustment records actor, reason and timestamp              | Verification pending; existing module alone is not acceptance evidence |
| APIs expose availability without exposing internal mutation rules | Verification pending; existing module alone is not acceptance evidence |

## #26 — Implement stock reservations and order inventory lifecycle

Source: https://github.com/Izyane-InovSolutions/commerce/issues/26

Implementation evidence: `services/commerce-api/src/modules/inventory`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                              | Status / remaining dependency                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Reserve stock at the defined order/payment boundary      | Verification pending; existing module alone is not acceptance evidence |
| Reservation expiry/release rules                         | Verification pending; existing module alone is not acceptance evidence |
| Commit stock for fulfilled orders                        | Verification pending; existing module alone is not acceptance evidence |
| Release stock for cancellations/failures                 | Verification pending; existing module alone is not acceptance evidence |
| Concurrency protection/transactions                      | Verification pending; existing module alone is not acceptance evidence |
| Inventory movement audit trail                           | Verification pending; existing module alone is not acceptance evidence |
| Concurrent checkout cannot oversell a SKU                | Verification pending; existing module alone is not acceptance evidence |
| Failed/cancelled orders release reservations correctly   | Verification pending; existing module alone is not acceptance evidence |
| Fulfillment commits stock exactly once                   | Verification pending; existing module alone is not acceptance evidence |
| Inventory lifecycle is recoverable from movement history | Verification pending; existing module alone is not acceptance evidence |

## #27 — Build suppliers, purchase orders and goods receiving

Source: https://github.com/Izyane-InovSolutions/commerce/issues/27

Implementation evidence: `services/commerce-api/src/modules/procurement`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                              | Status / remaining dependency                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Supplier records                                         | Verification pending; existing module alone is not acceptance evidence |
| Purchase orders and line items                           | Verification pending; existing module alone is not acceptance evidence |
| PO status workflow                                       | Verification pending; existing module alone is not acceptance evidence |
| Goods receiving                                          | Verification pending; existing module alone is not acceptance evidence |
| Partial receipts and discrepancies                       | Verification pending; existing module alone is not acceptance evidence |
| Inventory updates from receipts                          | Verification pending; existing module alone is not acceptance evidence |
| Supplier/order audit history                             | Verification pending; existing module alone is not acceptance evidence |
| Receiving increases the correct warehouse/SKU stock      | Verification pending; existing module alone is not acceptance evidence |
| Partial and over/under deliveries are handled explicitly | Verification pending; existing module alone is not acceptance evidence |
| Purchase orders have controlled status transitions       | Verification pending; existing module alone is not acceptance evidence |
| Inventory changes are traceable to receiving events      | Verification pending; existing module alone is not acceptance evidence |

## #28 — Implement fulfillment workflows and warehouse picking

Source: https://github.com/Izyane-InovSolutions/commerce/issues/28

Implementation evidence: `services/commerce-api/src/modules/fulfillment`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                      | Status / remaining dependency                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Fulfillment orders/work items                                    | Verification pending; existing module alone is not acceptance evidence |
| Picking and packing statuses                                     | Verification pending; existing module alone is not acceptance evidence |
| Warehouse assignment                                             | Verification pending; existing module alone is not acceptance evidence |
| Partial fulfillment                                              | Verification pending; existing module alone is not acceptance evidence |
| Packing and dispatch events                                      | Verification pending; existing module alone is not acceptance evidence |
| Cancellation handling after fulfillment begins                   | Verification pending; existing module alone is not acceptance evidence |
| Every fulfillable order line has a clear fulfillment state       | Verification pending; existing module alone is not acceptance evidence |
| Picking/packing actions are authorized and audited               | Verification pending; existing module alone is not acceptance evidence |
| Partial fulfillment is supported without corrupting order totals | Verification pending; existing module alone is not acceptance evidence |
| Dispatch can only occur from a valid packed state                | Verification pending; existing module alone is not acceptance evidence |

## #29 — Implement shipping, tracking and delivery states

Source: https://github.com/Izyane-InovSolutions/commerce/issues/29

Implementation evidence: `services/commerce-api/src/modules/shipments`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                    | Status / remaining dependency                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Shipping methods/rates                                         | Verification pending; existing module alone is not acceptance evidence |
| Shipment records                                               | Verification pending; existing module alone is not acceptance evidence |
| Tracking references                                            | Verification pending; existing module alone is not acceptance evidence |
| Carrier abstraction                                            | Verification pending; existing module alone is not acceptance evidence |
| In-transit/out-for-delivery/delivered states                   | Verification pending; existing module alone is not acceptance evidence |
| Customer tracking view                                         | Verification pending; existing module alone is not acceptance evidence |
| Delivery event history                                         | Verification pending; existing module alone is not acceptance evidence |
| Shipments are linked to fulfillments and orders                | Verification pending; existing module alone is not acceptance evidence |
| Tracking updates are idempotent and auditable                  | Verification pending; existing module alone is not acceptance evidence |
| Customer-facing status is derived from trusted shipment events | Verification pending; existing module alone is not acceptance evidence |
| Carrier implementation is provider-agnostic                    | Verification pending; existing module alone is not acceptance evidence |

## #30 — Build returns, refunds and retail operations dashboard

Source: https://github.com/Izyane-InovSolutions/commerce/issues/30

Implementation evidence: `services/commerce-api/src/modules/returns`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                         | Status / remaining dependency                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Return request workflow                                             | Verification pending; existing module alone is not acceptance evidence |
| Return eligibility and reasons                                      | Verification pending; existing module alone is not acceptance evidence |
| Inspection/receipt state                                            | Verification pending; existing module alone is not acceptance evidence |
| Refund creation through payment abstraction                         | Verification pending; existing module alone is not acceptance evidence |
| Refund event/audit model                                            | Verification pending; existing module alone is not acceptance evidence |
| Operations dashboard for orders, inventory, fulfillment and returns | Verification pending; existing module alone is not acceptance evidence |
| Basic retail reporting                                              | Verification pending; existing module alone is not acceptance evidence |
| Refunds are tied to verified payment transactions                   | Verification pending; existing module alone is not acceptance evidence |
| Returns and refunds have explicit status transitions                | Verification pending; existing module alone is not acceptance evidence |
| Staff permissions are enforced                                      | Verification pending; existing module alone is not acceptance evidence |
| Operational metrics can be filtered by date/status/warehouse        | Verification pending; existing module alone is not acceptance evidence |

## #31 — Implement seller registration and onboarding

Source: https://github.com/Izyane-InovSolutions/commerce/issues/31

Implementation evidence: `services/commerce-api/src/modules/sellers`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                      | Status / remaining dependency                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| Seller account/profile                           | Verification pending; existing module alone is not acceptance evidence |
| Business details                                 | Verification pending; existing module alone is not acceptance evidence |
| Verification/KYB data model                      | Verification pending; existing module alone is not acceptance evidence |
| Required documents/media                         | Verification pending; existing module alone is not acceptance evidence |
| Onboarding states                                | Verification pending; existing module alone is not acceptance evidence |
| Admin review queue                               | Verification pending; existing module alone is not acceptance evidence |
| Approval, rejection and suspension actions       | Verification pending; existing module alone is not acceptance evidence |
| Seller cannot publish offers before approval     | Verification pending; existing module alone is not acceptance evidence |
| Onboarding status is explicit and auditable      | Verification pending; existing module alone is not acceptance evidence |
| Admin actions are permission-controlled          | Verification pending; existing module alone is not acceptance evidence |
| Sensitive verification data is access-restricted | Verification pending; existing module alone is not acceptance evidence |

## #32 — Implement seller storefronts and marketplace offer model

Source: https://github.com/Izyane-InovSolutions/commerce/issues/32

Implementation evidence: `services/commerce-api/src/modules/offers`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                               | Status / remaining dependency                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Seller storefront profile                                 | Verification pending; existing module alone is not acceptance evidence |
| Product-to-seller Offer relation                          | Verification pending; existing module alone is not acceptance evidence |
| Offer price, stock source, condition and fulfillment mode | Verification pending; existing module alone is not acceptance evidence |
| Seller-specific SKU/listing metadata                      | Verification pending; existing module alone is not acceptance evidence |
| Offer publishing/unpublishing                             | Verification pending; existing module alone is not acceptance evidence |
| Customer offer selection API                              | Verification pending; existing module alone is not acceptance evidence |
| One Product can have multiple Offers                      | Verification pending; existing module alone is not acceptance evidence |
| Retail is represented as a first-party offer              | Verification pending; existing module alone is not acceptance evidence |
| Suspended/unapproved sellers cannot publish offers        | Verification pending; existing module alone is not acceptance evidence |
| Customers can compare/select eligible offers              | Verification pending; existing module alone is not acceptance evidence |

## #33 — Build seller inventory and catalog management portal

Source: https://github.com/Izyane-InovSolutions/commerce/issues/33

Implementation evidence: `services/commerce-api/src/modules/inventory`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                                      | Status / remaining dependency                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Seller dashboard shell                                                           | Verification pending; existing module alone is not acceptance evidence |
| Offer/listing create/edit/archive                                                | Verification pending; existing module alone is not acceptance evidence |
| Seller SKU/inventory quantities                                                  | Verification pending; existing module alone is not acceptance evidence |
| Bulk inventory update foundation                                                 | Verification pending; existing module alone is not acceptance evidence |
| Media upload                                                                     | Verification pending; existing module alone is not acceptance evidence |
| Listing validation and publish workflow                                          | Verification pending; existing module alone is not acceptance evidence |
| Sellers can manage only their own offers/inventory                               | Verification pending; existing module alone is not acceptance evidence |
| Listing validation prevents incomplete/invalid offers from publication           | Verification pending; existing module alone is not acceptance evidence |
| Inventory updates are auditable                                                  | Verification pending; existing module alone is not acceptance evidence |
| Canonical product data cannot be modified by sellers without explicit permission | Verification pending; existing module alone is not acceptance evidence |

## #34 — Implement unified cart and multi-seller order splitting

Source: https://github.com/Izyane-InovSolutions/commerce/issues/34

Implementation evidence: `services/commerce-api/src/modules/orders`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                              | Status / remaining dependency                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Cart lines tied to Offer IDs                             | Verification pending; existing module alone is not acceptance evidence |
| Seller/fulfillment grouping                              | Verification pending; existing module alone is not acceptance evidence |
| Order + child seller/fulfillment records                 | Verification pending; existing module alone is not acceptance evidence |
| Price/stock validation across sellers                    | Verification pending; existing module alone is not acceptance evidence |
| Shipping grouping and totals                             | Verification pending; existing module alone is not acceptance evidence |
| Seller order visibility                                  | Verification pending; existing module alone is not acceptance evidence |
| One customer checkout can contain multiple sellers       | Verification pending; existing module alone is not acceptance evidence |
| Backend calculates seller splits deterministically       | Verification pending; existing module alone is not acceptance evidence |
| Each seller sees only its own order lines                | Verification pending; existing module alone is not acceptance evidence |
| Customer sees one coherent order with fulfillment groups | Verification pending; existing module alone is not acceptance evidence |

## #35 — Implement marketplace commissions, balances and ledger

Source: https://github.com/Izyane-InovSolutions/commerce/issues/35

Implementation evidence: `services/commerce-api/src/modules/financials`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                  | Status / remaining dependency                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Platform/seller financial accounts                           | Verification pending; existing module alone is not acceptance evidence |
| Commission configuration                                     | Verification pending; existing module alone is not acceptance evidence |
| Per-order commission transactions                            | Verification pending; existing module alone is not acceptance evidence |
| Seller payable balance                                       | Verification pending; existing module alone is not acceptance evidence |
| Immutable ledger entries                                     | Verification pending; existing module alone is not acceptance evidence |
| Adjustments/reversals                                        | Verification pending; existing module alone is not acceptance evidence |
| Reconciliation references                                    | Verification pending; existing module alone is not acceptance evidence |
| Seller earnings can be derived from ledger entries           | Verification pending; existing module alone is not acceptance evidence |
| Commission calculations are auditable per order line/seller  | Verification pending; existing module alone is not acceptance evidence |
| Refunds/cancellations reverse financial effects correctly    | Verification pending; existing module alone is not acceptance evidence |
| No balance changes occur without corresponding ledger events | Verification pending; existing module alone is not acceptance evidence |

## #36 — Implement seller payouts and reconciliation

Source: https://github.com/Izyane-InovSolutions/commerce/issues/36

Implementation evidence: `services/commerce-api/src/modules/financials/payouts`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                    | Status / remaining dependency                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Payout account/profile model                   | Verification pending; existing module alone is not acceptance evidence |
| Payout request workflow                        | Verification pending; existing module alone is not acceptance evidence |
| Minimum/hold rules                             | Verification pending; existing module alone is not acceptance evidence |
| Payout batches/transactions                    | Verification pending; existing module alone is not acceptance evidence |
| Idempotency and duplicate prevention           | Verification pending; existing module alone is not acceptance evidence |
| Reconciliation status                          | Verification pending; existing module alone is not acceptance evidence |
| Payout history                                 | Verification pending; existing module alone is not acceptance evidence |
| Sellers cannot withdraw unavailable/held funds | Verification pending; existing module alone is not acceptance evidence |
| Payouts reference ledger balances              | Verification pending; existing module alone is not acceptance evidence |
| Duplicate payout attempts are prevented        | Verification pending; existing module alone is not acceptance evidence |
| Failed payouts remain traceable and retryable  | Verification pending; existing module alone is not acceptance evidence |

## #37 — Build seller order and fulfillment portal

Source: https://github.com/Izyane-InovSolutions/commerce/issues/37

Implementation evidence: `services/commerce-api/src/modules/fulfillment`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                             | Status / remaining dependency                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| Seller order queue                                      | Verification pending; existing module alone is not acceptance evidence |
| Order detail by seller lines                            | Verification pending; existing module alone is not acceptance evidence |
| Accept/reject rules where applicable                    | Verification pending; existing module alone is not acceptance evidence |
| Seller fulfillment statuses                             | Verification pending; existing module alone is not acceptance evidence |
| Dispatch/tracking entry                                 | Verification pending; existing module alone is not acceptance evidence |
| Cancellation handling                                   | Verification pending; existing module alone is not acceptance evidence |
| Returns visibility                                      | Verification pending; existing module alone is not acceptance evidence |
| Seller sees only authorized orders                      | Verification pending; existing module alone is not acceptance evidence |
| Seller actions update only its fulfillment scope        | Verification pending; existing module alone is not acceptance evidence |
| Customer order remains coherent across multiple sellers | Verification pending; existing module alone is not acceptance evidence |
| Status transitions are validated server-side            | Verification pending; existing module alone is not acceptance evidence |

## #38 — Add marketplace reviews, ratings and moderation

Source: https://github.com/Izyane-InovSolutions/commerce/issues/38

Implementation evidence: `services/commerce-api/src/modules/reviews`.

Test evidence: co-located unit tests and services/commerce-api/test; criterion-level verification pending.

| Requirement                                                   | Status / remaining dependency                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Product reviews                                               | Verification pending; existing module alone is not acceptance evidence |
| Seller ratings                                                | Verification pending; existing module alone is not acceptance evidence |
| Verified-purchase marker                                      | Verification pending; existing module alone is not acceptance evidence |
| Review submission/edit policy                                 | Verification pending; existing module alone is not acceptance evidence |
| Moderation queue                                              | Verification pending; existing module alone is not acceptance evidence |
| Abuse/report action                                           | Verification pending; existing module alone is not acceptance evidence |
| Rating aggregates                                             | Verification pending; existing module alone is not acceptance evidence |
| Only eligible customers can review purchased items            | Verification pending; existing module alone is not acceptance evidence |
| Seller/product aggregates are recalculated consistently       | Verification pending; existing module alone is not acceptance evidence |
| Moderated/removed reviews are excluded from public aggregates | Verification pending; existing module alone is not acceptance evidence |
| Admin moderation is audited                                   | Verification pending; existing module alone is not acceptance evidence |

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
| Device token registration                                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Push notification service integration                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Order/payment/shipment notification events                   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Deep links from notifications                                | Deferred to roadmap milestone; configuration/live adapters separately gated |
| App update/error handling                                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Crash/error reporting                                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Android/iOS release configuration                            | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Notification events originate from backend business events   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Deep links open the correct authenticated/public destination | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Device tokens can be revoked/rotated                         | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Production builds are reproducible                           | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #45 — Build promotions, coupons and pricing rules engine

Source: https://github.com/Izyane-InovSolutions/commerce/issues/45

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                     | Status / remaining dependency                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Promotion campaigns                                             | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Coupon codes                                                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Eligibility rules                                               | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Product/category/offer targeting                                | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Usage limits                                                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Start/end dates                                                 | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Discount calculation service                                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Audit/history                                                   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Promotion calculations occur server-side                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Rules are deterministic and tested                              | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Stacking/exclusion behavior is explicit                         | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Checkout shows applied discounts from backend-calculated totals | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #46 — Implement collections, merchandising and advanced search

Source: https://github.com/Izyane-InovSolutions/commerce/issues/46

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                       | Status / remaining dependency                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Curated collections                                               | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Featured products                                                 | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Search autocomplete/suggestions                                   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Faceted search                                                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Synonyms and typo-tolerant search foundation                      | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Sort/ranking controls                                             | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Search indexing pipeline                                          | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Merchandising can feature products without changing catalog truth | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Search remains backed by authoritative product/offer data         | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Index updates are resilient and observable                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Filters and autocomplete are fast and consistent                  | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #47 — Add loyalty, gift cards and customer retention foundations

Source: https://github.com/Izyane-InovSolutions/commerce/issues/47

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                          | Status / remaining dependency                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Loyalty account model                                | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Points earning/redemption rules                      | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Gift card issuance/activation/redemption             | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Balance ledger                                       | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Customer eligibility rules                           | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Order integration                                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Loyalty/gift card balances are ledger-backed         | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Redemption cannot exceed available balance           | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Refunds/reversals correctly restore or reverse value | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Transactions are auditable                           | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #48 — Build customer support and case management

Source: https://github.com/Izyane-InovSolutions/commerce/issues/48

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                                  | Status / remaining dependency                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Support tickets/cases                                                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Customer/order/product references                                            | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Status, priority and assignment                                              | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Internal/admin notes                                                         | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Customer-facing ticket history                                               | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Notification hooks                                                           | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Support agents can find orders and customers without exposing unrelated data | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Cases have clear lifecycle states                                            | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Customer and staff views are permission-separated                            | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Important actions are auditable                                              | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #49 — Add recommendations, recently viewed and commerce analytics

Source: https://github.com/Izyane-InovSolutions/commerce/issues/49

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                             | Status / remaining dependency                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| Recently viewed events                                  | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Recommendation service abstraction                      | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Frequently bought together foundation                   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Product/customer event tracking                         | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Retail vs marketplace analytics                         | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Funnel, conversion and order metrics                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Dashboard APIs                                          | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Recommendation failures never block checkout            | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Analytics distinguish retail and marketplace activity   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Event ingestion is asynchronous where appropriate       | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Dashboards use reproducible definitions for key metrics | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #50 — Build provider-agnostic courier and 3PL integration layer

Source: https://github.com/Izyane-InovSolutions/commerce/issues/50

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                           | Status / remaining dependency                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| Carrier/3PL interface                                 | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Shipment booking                                      | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Tracking synchronization                              | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Delivery event ingestion                              | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Label/reference handling                              | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Provider credentials/configuration boundaries         | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Retry/reconciliation jobs                             | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Providers are replaceable behind an adapter interface | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Webhook/event handling is idempotent                  | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Provider failures do not corrupt order states         | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Operations can reconcile shipment discrepancies       | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #51 — Implement seller fulfillment programs and service levels

Source: https://github.com/Izyane-InovSolutions/commerce/issues/51

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                   | Status / remaining dependency                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Seller fulfillment configurations                             | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Platform-fulfilled vs seller-fulfilled modes                  | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Handling/dispatch SLAs                                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Cut-off times                                                 | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Fulfillment eligibility rules                                 | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Seller compliance monitoring                                  | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Fulfillment mode is explicit per offer/order line             | Deferred to roadmap milestone; configuration/live adapters separately gated |
| SLA breaches are measurable                                   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Customer delivery estimates reflect fulfillment configuration | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Seller performance can be acted on by admins                  | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #52 — Add seller messaging, promotions and merchandising tools

Source: https://github.com/Izyane-InovSolutions/commerce/issues/52

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                            | Status / remaining dependency                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Seller/customer messaging foundation                   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Seller-specific promotions                             | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Offer discounts                                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Promotion approval rules                               | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Seller campaign management                             | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Moderation/reporting                                   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Messaging respects customer privacy and seller scope   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Seller promotions cannot bypass platform pricing rules | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Admin can suspend campaigns or messaging privileges    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Promotional activity is auditable                      | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #53 — Establish sponsored products and advertising foundations

Source: https://github.com/Izyane-InovSolutions/commerce/issues/53

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                       | Status / remaining dependency                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Advertising campaign model                                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Sponsored offer/product placements                                | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Budget and schedule primitives                                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Ad eligibility                                                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Impression/click/conversion event model                           | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Admin controls and reporting                                      | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Sponsored content is clearly distinguishable from organic results | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Budget/schedule constraints are enforced server-side              | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Advertising events do not alter transactional totals              | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Organic ranking remains independently testable                    | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #54 — Build advanced seller analytics and performance controls

Source: https://github.com/Izyane-InovSolutions/commerce/issues/54

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                           | Status / remaining dependency                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| Sales/revenue analytics                               | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Order/fulfillment metrics                             | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Cancellation/return rates                             | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Customer rating metrics                               | Deferred to roadmap milestone; configuration/live adapters separately gated |
| SLA/performance scorecards                            | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Seller warnings, holds and suspension thresholds      | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Exportable reports                                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Metrics are scoped correctly to each seller           | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Performance calculations have documented definitions  | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Admin actions can be triggered from policy thresholds | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Analytics do not alter transactional records          | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #55 — Implement offer ranking and Buy Box engine

Source: https://github.com/Izyane-InovSolutions/commerce/issues/55

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                  | Status / remaining dependency                                               |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Offer eligibility checks                     | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Price/shipping/stock/rating signals          | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Buy Box selection service                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Explainable ranking breakdown                | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Manual/admin overrides where needed          | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Ranking audit history                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Ineligible offers never win the Buy Box      | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Ranking is deterministic for the same inputs | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Ranking factors are observable and auditable | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Product pages can show alternative offers    | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #56 — Implement Make an Offer and counter-offer workflows

Source: https://github.com/Izyane-InovSolutions/commerce/issues/56

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                   | Status / remaining dependency                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Offer negotiation entities                                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Buyer offer submission                                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Seller accept/reject/counter                                  | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Expiry and timeout rules                                      | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Price locking on acceptance                                   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Conversion to standard checkout/order                         | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Only valid active offers can be negotiated                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Negotiated price is immutable once accepted                   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Expired/rejected offers cannot be fulfilled                   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Accepted negotiations enter the normal order/payment workflow | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #57 — Build auction listings, bidding and settlement

Source: https://github.com/Izyane-InovSolutions/commerce/issues/57

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                      | Status / remaining dependency                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Auction listing model                                            | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Start/end times                                                  | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Minimum bid/reserve price                                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Bid placement and validation                                     | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Bid history                                                      | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Winner selection                                                 | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Auction settlement and order creation                            | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Bid notifications                                                | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Bids are validated atomically and cannot bypass auction rules    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Closed auctions have one authoritative winner or no-sale outcome | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Winning bids convert to standard order/payment workflows         | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Bid history is immutable and auditable                           | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #58 — Establish dynamic pricing and price experimentation foundations

Source: https://github.com/Izyane-InovSolutions/commerce/issues/58

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                               | Status / remaining dependency                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| Dynamic pricing rules                                     | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Price schedules                                           | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Customer/segment eligibility hooks                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Price snapshots at checkout                               | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Approval/audit controls                                   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Pricing simulation API                                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Final transaction price is always snapshotted server-side | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Pricing rules are deterministic and auditable             | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Expired pricing cannot be applied                         | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Simulation does not mutate live prices                    | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #59 — Integrate advanced recommendations, AI and personalization services

Source: https://github.com/Izyane-InovSolutions/commerce/issues/59

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                  | Status / remaining dependency                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Recommendation service adapters                              | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Personalized home/product feeds                              | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Ranking feature pipeline                                     | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Embedding/vector-search integration point                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Explainability/feature logging                               | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Fallback strategies                                          | Deferred to roadmap milestone; configuration/live adapters separately gated |
| AI/recommendation failures never block shopping or checkout  | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Recommendation inputs/outputs are observable                 | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Transactional systems remain authoritative                   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Personalization can be disabled or rolled back independently | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #60 — Implement advanced fraud controls and experimentation

Source: https://github.com/Izyane-InovSolutions/commerce/issues/60

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                     | Status / remaining dependency                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Risk scoring service interface                                  | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Transaction/seller/customer risk signals                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Holds/manual review                                             | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Suspicious bid/payment/order detection hooks                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Feature flags and A/B experiments                               | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Experiment assignment and exposure tracking                     | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Rollback controls                                               | Deferred to roadmap milestone; configuration/live adapters separately gated |
| High-risk activity can be held before fulfillment/payout        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Risk decisions are explainable and auditable                    | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Experiments can be enabled for scoped cohorts                   | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Experiment failures can be disabled without redeployment        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Risk/experiment services cannot directly mutate financial truth | Deferred to roadmap milestone; configuration/live adapters separately gated |

## #61 — Automate seller payouts and strengthen marketplace risk controls

Source: https://github.com/Izyane-InovSolutions/commerce/issues/61

Implementation evidence: not implemented; future milestone.

Test evidence: none yet; add unit, PostgreSQL and HTTP acceptance tests with implementation.

| Requirement                                                      | Status / remaining dependency                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Scheduled payout jobs                                            | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Payout eligibility checks                                        | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Holds/reserve periods                                            | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Retry and reconciliation workflow                                | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Marketplace risk checks before payout                            | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Manual review/override controls                                  | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Payout operational dashboard                                     | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Automated payouts are idempotent and reconciliation-safe         | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Risk/hold rules can prevent payout without altering ledger truth | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Every payout has a complete audit trail                          | Deferred to roadmap milestone; configuration/live adapters separately gated |
| Failed batches can be resumed without duplicate settlement       | Deferred to roadmap milestone; configuration/live adapters separately gated |

## Execution log

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
