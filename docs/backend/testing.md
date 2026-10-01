# Testing

Use Node 24 and the root lockfile. Current outcomes and dates are in the [verification ledger](baseline-verification.md); source findings are in the [gap register](known-gaps.md).

## Test layers

| Layer | Pattern / configuration | Database and limits |
| --- | --- | --- |
| Unit | `src/**/*.spec.ts`; API `package.json` Jest block | Mocked collaborators; not proof of PostgreSQL locking or provider delivery. |
| HTTP | `test/*.e2e-spec.ts`; `test/jest-e2e.json` | Fake Prisma for application suites; also includes test-provider isolation. |
| Integration | `test/*.integration-spec.ts`; `test/jest-integration.json` | Real PostgreSQL; guarded target, migrations before tests, scoped fixture cleanup. |
| Legacy database checks | `test/*.database-check.cjs` | Compiled services and a real DB; these scripts do not use Jest database safeguards and are outside the new CI gate. |

`test/support/fake-prisma.service.ts` must follow model changes used by HTTP tests. `fake-payment-provider.ts` exercises payment events without gateway calls. `issue-test-token.ts` supplies sessions required by authentication guards.

## Isolated local PostgreSQL 17

Install Docker with Compose support first. Run from the repository root:

```powershell
docker compose -f deploy/docker-compose.test.yml up -d --wait
Copy-Item services/commerce-api/.env.integration.example services/commerce-api/.env.integration
npm ci --workspace=@commerce/commerce-api --include-workspace-root
npm run prisma:generate --workspace=@commerce/commerce-api
npm run test:integration --workspace=@commerce/commerce-api
```

Copy the example only on first setup; inspect an existing `.env.integration` instead of overwriting it. It is ignored by Git. The example contains public disposable test credentials, not application secrets. Complete dependency installation before running checks that use `node_modules`.

The Compose project `commerce-tests` uses PostgreSQL 17, database/user `commerce_test`, a dedicated `test-pgdata` volume and **127.0.0.1:55432**. It does not reference deployment volumes, `env_file` or application credentials. Do not combine it with deployment Compose files. Tests sharing one database must run serially; CI gets its own service instance per job.

Stop the test service without removing its data:

```powershell
docker compose -f deploy/docker-compose.test.yml down
```

The 2026-09-30 Step 2 run verified Docker Desktop's WSL 2 Linux engine and the commands above from a newly created test volume. The dedicated Compose service became healthy on `127.0.0.1:55432`; all 42 migrations, 16 suites and 79 integration tests passed. GitHub Actions provisions an independent PostgreSQL 17 service and does not require developer database credentials or secrets.

## Database and provider safeguards

[integration-test.config.ts](../../services/commerce-api/src/infrastructure/config/integration-test.config.ts) and its existing unit tests retain these safeguards:

- `TEST_DATABASE_NAME` must end in `_test` and exactly match `TEST_DATABASE_URL`.
- The URL must use PostgreSQL and only the `public` schema.
- Missing test configuration never silently falls back to the application database.
- The existing `disposable-development` exception requires an explicit matching local database name and rejects production configuration. New Compose and CI configuration do not use this exception.

[setup-integration-env.ts](../../services/commerce-api/test/setup-integration-env.ts) checks the original environment before forcing test mode. [prepare-integration-database.ts](../../services/commerce-api/test/prepare-integration-database.ts) then runs `prisma migrate deploy`; it does not create, reset or drop databases. The container/service creates the database.

All Jest layers use [test-provider-env.ts](../../services/commerce-api/test/test-provider-env.ts): scheduling is disabled, payments use `pending`, storage is local, FX/gateway credentials are removed, SMTP credentials are cleared and SMTP points to unreachable loopback port 1. Provider unit tests inject mocks. The application ignores `.env` in test mode. Unit/HTTP database URLs are unreachable placeholders; integration uses only the validated target. Tests can invoke worker methods explicitly; automatic workers stay off.

The [isolation regression test](../../services/commerce-api/test/test-provider-env.e2e-spec.ts) checks inherited live settings are overridden while the chosen database is preserved. This is provider configuration isolation, not an OS network sandbox.

## Commands and CI

Run from the repository root:

```powershell
npm run typecheck --workspace=@commerce/commerce-api
npm run lint --workspace=@commerce/commerce-api
npm run format:check --workspace=@commerce/commerce-api
npm run swagger:check --workspace=@commerce/commerce-api
npm test --workspace=@commerce/commerce-api
npm run test:e2e --workspace=@commerce/commerce-api
npm run test:integration --workspace=@commerce/commerce-api
npm run build --workspace=@commerce/commerce-api
```

The [backend workflow](../../.github/workflows/backend.yml) runs on pull requests, pushes to `main` and manual dispatch. Every job uses Node 24, installs backend dependencies from the root lockfile and generates Prisma. Independent checks cover types, lint, formatting, Swagger, unit tests, HTTP tests and build. The integration job uses PostgreSQL 17 and the guarded Jest setup. Failures are strict; no check is allowed to fail. Build also rejects changes to committed generated Swagger contracts. The first remote workflow run remains required evidence.

`test:e2e` first checks Swagger consistency. `build` regenerates contracts; review any resulting diff rather than treating generation as verification.

## Remaining verification

These checks do not certify real SMTP/S3/gateway activation, production migrations, restore durability, load/response time, multi-replica failover or every acceptance criterion. Existing media, storage, outbox and notification specs supersede older claims that these areas had no tests. Use actual spec files and the dated ledger, not old suite counts. Legacy database-check scripts must only be pointed at a disposable database; they do not enforce the `_test` guard.
