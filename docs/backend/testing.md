# Testing

> The API's test layers, how to run each one, and the safety rules around test databases.

## Layers

| Layer           | Pattern                      | Count | Config                                                                                                                                                                       | Database                                          |
| --------------- | ---------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Unit            | `src/**/*.spec.ts`           | 79    | `jest` block in [package.json](../../services/commerce-api/package.json) (rootDir `src`)                                                                                     | None. Services are built with hand-written stubs  |
| E2E (HTTP)      | `test/*.e2e-spec.ts`         | 8     | [test/jest-e2e.json](../../services/commerce-api/test/jest-e2e.json) + [setup-env.ts](../../services/commerce-api/test/setup-env.ts)                                         | None. Uses `FakePrismaService` in memory          |
| Integration     | `test/*.integration-spec.ts` | 12    | [test/jest-integration.json](../../services/commerce-api/test/jest-integration.json) + [setup-integration-env.ts](../../services/commerce-api/test/setup-integration-env.ts) | **Real PostgreSQL**, a dedicated `_test` database |
| Database checks | `test/*.database-check.cjs`  | 3     | Run by hand with `node`                                                                                                                                                      | Real PostgreSQL, run against the built `dist/`    |

- **E2E suites:** `app`, `auth`, `cart`, `catalog`, `checkout`, `inventory`, `security`, `users`.
- **Integration suites:** `admin-review-moderation`, `auth-concurrency`, `fulfillment`, `payouts`, `payouts-http`, `procurement`, `returns`, `reviews`, `reviews-http`, `seller-fulfillment`, `seller-fulfillment-http`, `shipments`.
- **Database checks:** `financial-integrity`, `marketplace`, `sellers`.

## Commands

Run these from `services/commerce-api`, or add `--workspace @commerce/commerce-api` when running from the repo root.

```bash
npm test                  # unit, --runInBand
npm run test:watch
npm run test:e2e          # runs swagger:check first (pretest:e2e)
npm run test:integration  # needs a _test database; see below
npm run typecheck
npm run lint
npm run format:check      # prettier over src/ and test/ .ts files
npm run swagger:check     # fails if contracts.generated.json is stale
```

There is no CI workflow in the repository (`.github/workflows` does not exist), so all of these run locally. A reasonable order before pushing is: `typecheck` → `lint` → `format:check` → `test` → `test:e2e`, then `test:integration` if you changed anything that touches the database.

## Test support

Helpers in [test/support/](../../services/commerce-api/test/support/):

| File                       | Purpose                                                                                                                                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fake-prisma.service.ts`   | An in-memory stand-in for `PrismaService`, covering the models the e2e suites use. **Update it whenever you add a column that those flows read or write** (users, sessions, tokens and so on). Otherwise the e2e tests drift from the real schema.                          |
| `fake-payment-provider.ts` | `FakePaymentProvider`, a `PaymentProvider` that initialises every payment as `PENDING` and lets a test queue the event that the next `verifyWebhook()` returns. It is the only way to exercise the webhook settlement path, since the real gateway has no verified webhooks |
| `issue-test-token.ts`      | `issueTestToken(jwt, prisma, userId, role)` creates a real `Session` row and signs an access token for it. A made-up `sid` would be rejected by `JwtAuthGuard`                                                                                                              |

`setup-env.ts` gives the e2e tests a complete, valid environment with no `.env` file. The app ignores `.env` when `NODE_ENV=test`.

## Integration test database: safety rules

Integration tests migrate and then write to a real database. So [integration-test.config.ts](../../services/commerce-api/src/infrastructure/config/integration-test.config.ts) checks the target before anything connects, and refuses to run unless:

- `TEST_DATABASE_URL` and `TEST_DATABASE_NAME` are set, and the name **ends in `_test`**.
- The database in the URL is exactly that name, uses the `postgres:` or `postgresql:` scheme, and has no `schema` parameter other than `public`.

There is one opt-in exception. `INTEGRATION_DATABASE_MODE=disposable-development` tests against `DATABASE_URL` from `.env`, but only if:

- `INTEGRATION_DATABASE_NAME` matches the database name,
- the host is loopback, and
- `NODE_ENV` is not `production`.

What `setup-integration-env.ts` does:

- Loads `.env.integration`.
- Sets `NODE_ENV=test` and `SCHEDULED_WORKERS_ENABLED=false`, so no intervals run and tests drive jobs themselves.
- Points `SHADOW_DATABASE_URL` at an unreachable placeholder.
- Fills in test-only secrets and keyrings.

Global setup ([prepare-integration-database.ts](../../services/commerce-api/test/prepare-integration-database.ts)) runs `prisma migrate deploy`. **It never creates, drops or resets a database**: create the `_test` database yourself.

```bash
createdb commerce_test
cat > services/commerce-api/.env.integration <<'EOF'
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/commerce_test
TEST_DATABASE_NAME=commerce_test
EOF
npm run test:integration --workspace @commerce/commerce-api
```

For more detail see [backend-release-1-verification.md](../backend-release-1-verification.md).

## Database checks

Each `test/*.database-check.cjs` script creates fixtures scoped to fresh UUIDs, runs real transactions (including concurrent connections) against the **compiled** services in `dist/`, and then deletes only those fixtures:

```bash
npm run build --workspace @commerce/commerce-api
node --env-file=.env test/financial-integrity.database-check.cjs
```

**Warning:** these scripts use whatever `DATABASE_URL` is in the env file, and they do not apply the `_test` safety rules. Point them at a disposable database, never at production.

## What is not covered

- **No specs at all:** the media module, `refund-cases.service.ts`, `jobs/fulfillment-cancellation-refund.handler.ts`, `supplier-products.service.ts`, `EmailSendHandler` and `SmtpEmailSender`.
- **Controllers:** mostly tested through the e2e and integration suites rather than their own specs.
- **Integrations:** payments against the real Unified gateway and FX refresh against exchangerate-api.com are only unit-tested with a mocked `fetch`.
- **Module gaps:** each module doc's **Tests** section lists that module's coverage and gaps.
