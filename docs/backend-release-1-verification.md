# Backend stabilization: verification and rollout

This milestone does not complete releases 2–4. See the acceptance matrix. Password-reset delivery and payment hardening remain deferred. Do not close issues or enable live money movement based on unit tests alone.

## Isolated PostgreSQL tests

Provision a disposable database with a name ending in `_test`. Give its test role access only to that database. Use a separate database per concurrent test run. Supply `TEST_DATABASE_URL` and `TEST_DATABASE_NAME` through the environment or the ignored `.env.integration` file. Never place real application database credentials there.

By default, `TEST_DATABASE_URL` and `TEST_DATABASE_NAME` are mandatory and must identify the same database. The suite refuses other database names and non-public schemas. It never silently falls back to the application `.env`. Global setup runs `prisma migrate deploy` on the approved database; it never creates or resets databases. Scheduled decorators are disabled for the suite; worker tests explicitly invoke worker methods. Application payment configuration defaults to the pending test adapter.

For an explicitly confirmed disposable local development database, use the opt-in below. This loads the application `.env`, requires an exact database-name match and a loopback host, and rejects production configuration. It applies migrations and creates/deletes test fixtures: never enable it for important data. On 2026-09-20 the user confirmed that the local `commerce` database is disposable.

```powershell
$env:INTEGRATION_DATABASE_MODE='disposable-development'
$env:INTEGRATION_DATABASE_NAME='commerce'
npm run test:integration --workspace=@commerce/commerce-api
Remove-Item Env:INTEGRATION_DATABASE_MODE
Remove-Item Env:INTEGRATION_DATABASE_NAME
```

Run from the repository root:

```powershell
npm run test:integration --workspace=@commerce/commerce-api
npm run test:e2e --workspace=@commerce/commerce-api
npm test --workspace=@commerce/commerce-api
npm test --workspace=@commerce/contracts
npm test --workspace=@commerce/api-client
npm run typecheck --workspace=@commerce/commerce-api
npm run lint --workspace=@commerce/commerce-api
npm run build --workspace=@commerce/commerce-api
```

The integration suite includes payout transport uncertainty, persistence failure rollback, conflicting/identical concurrent reconciliation, parallel batch claims, crash recovery and seller HTTP concurrency-token consumption. On 2026-09-20 all 11 suites / 53 tests passed against the confirmed disposable local database. The corrective paid-balance migration applied successfully; Prisma reports all 31 migrations up to date. The read-only review-summary integrity command also passed. This is local verification, not staging or live-provider acceptance.

## Paid-balance migration

`20260919130000_backfill_paid_balances` derives lifetime paid totals from payout rows, resets sellers without payouts to zero, and leaves financial ledger history unchanged. It takes table locks, rejects mixed-currency history, and fails rather than truncating out-of-range totals. Apply during a controlled financial-maintenance window with payouts paused. Do not edit previously deployed migrations.

Before and after migration, call `GET /api/v1/admin/sellers/:id/balance/integrity` for each seller. The admin-only endpoint uses a repeatable-read snapshot and never releases holds or repairs data. It compares available, held, pending and paid projections and reports missing balance rows/mixed currencies. Existing fixture or production discrepancies need investigation; do not add ledger entries merely to make a report green.

## Payout operations

- Provider adapters must deduplicate the supplied stable attempt idempotency key. A new key is permitted only for a new attempt after a definitive failure.
- An uncertain outcome remains reserved in `RECONCILIATION_REQUIRED`; verify externally before resolving it. Never retry a timeout as if no transfer occurred.
- Suspended sellers, unverified/changed destinations are not submitted. These requests remain reserved for review. Verify eligibility and destination before resolving a not-submitted attempt as failed and authorizing retry.
- Startup polls resume unfinished batches. Stale processing becomes reconcilable; approved assigned requests are processed without creating another settlement.
- Concurrent resolution requires the current request version. Identical idempotent commands replay; conflicting outcomes return conflict.
- The manual adapter remains the default. A successful manual resolution asserts a real external transfer; do not use it simply to clear a queue.

Stage deployment, backup restoration, live provider tests, tracing/alerts and a production rollout have not been performed by this local implementation. They remain release gates. On financial incidents, pause workers and reconcile forward; never delete or roll back completed transfers.
