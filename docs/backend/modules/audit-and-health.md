# Audit and health

> `AuditService` is the shared writer for the append-only `AuditEvent` table, and it redacts sensitive metadata keys. `HealthController` exposes public liveness and readiness (DB ping) probes.

## Purpose and features

- **Audit.** Any module can inject `AuditService` and call `record(event, tx?)`. It writes one `AuditEvent` row, inside the caller's transaction when a client is passed. Metadata goes through `redact` first. ADMIN-only audit list and action-filter endpoints exist.
- **Health.** Anyone can call two `@Public` probes, used by load balancers and orchestrators: liveness (always `{status: 'ok'}`) and readiness (Prisma `SELECT 1` through `@nestjs/terminus`).

## Routes

Conventions: see [../architecture.md](../architecture.md).

| Method | Path                 | Access | Idempotency | Description                                                                                                                                                                                                                                                                                                                                            |
| ------ | -------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | /api/v1/health       | Public | n/a         | Liveness, returns `{status: 'ok'}` with no dependencies checked ([health.controller.ts:26](../../../services/commerce-api/src/modules/health/health.controller.ts#L26))                                                                                                                                                                                |
| GET    | /api/v1/health/ready | Public | n/a         | Readiness: terminus `HealthCheckResult` with a `database` ping; 503 when the ping fails ([health.controller.ts:32](../../../services/commerce-api/src/modules/health/health.controller.ts#L32))                                                                                                                                                        |
| GET    | /api/v1/metrics      | Public | n/a         | In-memory request counters per method, route and status, plus uptime. It lives in `infrastructure/metrics`, not in a module, and is listed here with the other operational probes ([metrics.controller.ts:13](../../../services/commerce-api/src/infrastructure/metrics/metrics.controller.ts#L13)). The counters reset on restart and are per process |

The audit module exposes ADMIN-only `GET /api/v1/admin/audit-events` (filtered, paginated) and `GET /api/v1/admin/audit-events/actions`; see [audit-events.controller.ts](../../../services/commerce-api/src/modules/audit/audit-events.controller.ts).

## Services

| Service                                                                                                             | Responsibility                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuditService` ([audit.service.ts](../../../services/commerce-api/src/modules/audit/audit.service.ts))              | `record(event, client = prisma)` ([:19](../../../services/commerce-api/src/modules/audit/audit.service.ts#L19)). Exported by `AuditModule`.                                     |
| `HealthController` ([health.controller.ts](../../../services/commerce-api/src/modules/health/health.controller.ts)) | Uses terminus `HealthCheckService` + `PrismaHealthIndicator.pingCheck('database', prisma)` ([:35](../../../services/commerce-api/src/modules/health/health.controller.ts#L35)). |

`RecordAuditEventInput` ([audit-event.ts:1](../../../services/commerce-api/src/modules/audit/audit-event.ts#L1)): `action` (required), `actorUserId?`, `targetType?`, `targetId?`, `metadata?`, `ipAddress?`, `userAgent?`.

## Business rules

### Audit

- **Append-only by convention.** No code updates or deletes `AuditEvent` rows.
- **Transactional writes.** Passing `tx` makes the audit row commit or roll back with the business change ([audit.service.ts:14](../../../services/commerce-api/src/modules/audit/audit.service.ts#L14)). Most callers pass `tx`. The two payout-account audits run after or outside their business transaction ([payouts.service.ts:166](../../../services/commerce-api/src/modules/financials/payouts/payouts.service.ts#L166), [:256](../../../services/commerce-api/src/modules/financials/payouts/payouts.service.ts#L256)).
- **Redaction.** Metadata is deep-copied through `redact` ([audit.service.ts:30](../../../services/commerce-api/src/modules/audit/audit.service.ts#L30)). Any object key whose **lower-cased name exactly equals** one of the keys below becomes `[REDACTED]` ([redact.ts:1](../../../services/commerce-api/src/infrastructure/logging/redact.ts#L1)):
  - `password`, `passwordhash`, `currentpassword`, `newpassword`
  - `token`, `refreshtoken`, `accesstoken`, `authorization`, `secret`
  - `card`, `securitycode`, `cvv`, `pan`
  - `phonenumber`, `paymentdetails`
  - `x-api-key`, `apikey`, `unified_payments_api_key`
- **Redaction details.** Arrays are walked, circular references become `[CIRCULAR]`, and `Date`/`Error` values are kept as-is.
- **Action naming.** Action strings are dotted and free-form (`<domain>.<entity>.<verb>`). Nothing validates them.

Actions written through `AuditService.record` today:

| Module          | Actions                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| auth            | `auth.register`, `auth.login.success`, `auth.login.failure`, `auth.logout`, `auth.password.changed`, `auth.password_reset.requested`, `auth.password_reset.confirmed`, `auth.email_verification.confirmed`, `auth.email_verification.resent`, `auth.handoff.issued`, `auth.handoff.exchanged`, `auth.session.revoked`, `auth.sessions.others_revoked`, `auth.session.reuse_detected` |
| financials      | `payout_account.created`, `payout_account.destination_viewed`                                                                                                                                                                                                                                                                                                                        |
| fulfillment     | `fulfillment.order.created`                                                                                                                                                                                                                                                                                                                                                          |
| shipments       | `shipment.created`, `shipment.booked`, `shipment.cancelled`                                                                                                                                                                                                                                                                                                                          |
| procurement     | `procurement.supplier.*`, `procurement.purchase_order.*` (created, updated, submitted, approved, rejected, returned_to_draft, revised, ordered, cancelled, closed_short), `procurement.goods_receipt.*` (drafted, draft_deleted, posted, reversed)                                                                                                                                   |
| reviews (admin) | `reviews.moderation.approved`, `reviews.moderation.report_dismissed`, `reviews.moderation.<action>`                                                                                                                                                                                                                                                                                  |

Writes that **bypass** `AuditService`, and so also skip redaction:

- `sellers.service.ts:311` and `storefronts.service.ts:158` write seller actions.
- `marketplace-offers.service.ts:464` writes `targetType 'Offer'`.
- `gateway-payments.service.ts:186` writes `targetType 'Payment'`, outside any transaction.

### Health

- Liveness never touches the DB, so it only shows the process is serving HTTP ([health.controller.ts:25](../../../services/commerce-api/src/modules/health/health.controller.ts#L25)).
- Readiness runs a single check. Terminus returns 200 `{status: 'ok', info: {database: {status: 'up'}}}` on success and throws a 503 `ServiceUnavailableException` with the error details on failure.

## Data

| Model                                                                                                                                                    | Access                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `AuditEvent` (`id, actorUserId?, action, targetType?, targetId?, metadata Json?, ipAddress?, userAgent?, createdAt`; indexes on `actorUserId`, `action`) | create only                             |
| (health)                                                                                                                                                 | `SELECT 1` ping through `PrismaService` |

## Dependencies

- `AuditModule` provides and exports `AuditService` and depends only on `PrismaService` ([audit.module.ts:5](../../../services/commerce-api/src/modules/audit/audit.module.ts#L5)).
- **Importers:** auth, financials, fulfillment, shipments, procurement, reviews.
- `FulfillmentsService` injects `AuditService` but never calls it.
- `HealthModule` imports `TerminusModule` and `DatabaseModule` ([health.module.ts:7](../../../services/commerce-api/src/modules/health/health.module.ts#L7)).

## Jobs and events

None.

## Configuration

None.

## Tests

- [audit.service.spec.ts](../../../services/commerce-api/src/modules/audit/audit.service.spec.ts): field mapping, password redaction.
- [health.controller.spec.ts](../../../services/commerce-api/src/modules/health/health.controller.spec.ts): liveness payload, readiness delegates to terminus.
- `test/app.e2e-spec.ts` hits both health routes. `test/security.e2e-spec.ts` uses `/health` for header checks.

## Known gaps

- **No read path.** There is no admin API to query `AuditEvent`, so it is only readable directly in the DB.
- **Request metadata coverage varies.** Auth supplies request IP/user-agent metadata on relevant audit writes; other writers require individual review. Do not infer complete coverage from the schema fields.
- **Redaction misses variants.** It only matches exact key names. `accountNumber`, `iban`, `destination`, `email`, `mobileNumber`, `phone`, or `phone_number` in metadata are **not** redacted. Nested payout destinations or contact details would be stored in clear.
- **Four modules bypass `AuditService`** (sellers, storefronts, marketplace offers, gateway payments). Their metadata is not redacted, and the gateway-payments write is not transactional with the payment change.
- **Inconsistent coverage across domains.** Returns, fulfillment commands (cancel, exception resolve, seller reject), payout request transitions and operations have no `AuditEvent` rows (see those modules' docs).
- **Health probes are throttled.** Both routes fall under the global `ThrottlerGuard` (100 requests/60 s per client) because nothing marks them `@SkipThrottle`. Probes from a shared IP can be rate-limited (`app.module.ts:54`, `:90`).
- **Readiness checks only the DB.** It does not check SMTP, object storage, or whether the job worker is running.
