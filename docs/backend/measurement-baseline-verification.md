# Stage 6 verification: evidence gaps and measurements — 2026-10-02

Scope: Stage 6 of the [remaining hardening plan](remaining-hardening-plan.md#6-close-evidence-gaps-and-establish-measurements), covering B6 and the initial S5 fix. The source checkpoint is `99a6b01` plus the uncommitted Stage 6 changes listed below. Status words follow the [register policy](known-gaps.md#evidence-and-status-policy).

**Stage status: partial.** Local implementation and evidence pass. The first remote CI run (B6) is still externally blocked, and the provisional performance targets are not met.

## Delivered

| Item | Outcome |
| --- | --- |
| Register reconciliation | The S3 corrected-baseline row no longer contradicts the Step 5 fix. Cancellation text now cites the 2026-10-02 PostgreSQL run. "Destructive deletes" is split into H15 (protected) plus D1 (attribute values) and D2 (warehouses). Historical reports are untouched. See [known-gaps.md](known-gaps.md) |
| Inventory and stable IDs | [Runtime inventory](runtime-inventory.md): 296 routes, 6 job types, 9 recurring tasks, 20 outbox topics, every external call and 26 state machines. Untabled findings became D1–D9 and C1–C5, and new candidates N1–N8, each assigned to Stages 10–12 |
| Metrics | Route-template latency histograms and status counts are recorded by a middleware, so guard rejections, 404s and body-parser 413s are included; unmatched requests are labelled `unmatched`. Also recorded: in-flight requests, 60 s event-loop-delay windows, RSS/heap/CPU, job and outbox outcomes, duration, start lag and dispatch lag. Cached database gauges cover queue depth by type/topic and status, retrying and dead-letter rows, oldest-due age, stale claims, unresolved payments/refund cases/refunds/emails, PostgreSQL connections, lock waits and longest transaction, and the Prisma pool (`metrics` preview feature) |
| Access (S5) | `GET /api/v1/metrics` requires ADMIN. `GET /api/v1/metrics/prometheus` requires `Bearer METRICS_SCRAPE_TOKEN` (timing-safe) and returns 404 when the token is unset |
| Health and shutdown | Verified before changing: liveness has no dependencies, readiness pings the database, and Nest's `close()` runs `onModuleDestroy`, including `PrismaService.$disconnect()`, **before** the HTTP server stops accepting (`node_modules/@nestjs/core/nest-application-context.js:119-125`). Readiness never reported draining, and the job worker kept claiming during shutdown. Added: `ShutdownState` with readiness 503 while draining, `SHUTDOWN_DRAIN_DELAY_MS`, a signal handler replacing `enableShutdownHooks`, Prisma disconnect moved to `onApplicationShutdown`, and the job worker stops claiming and waits up to 10 s for its current job |
| Logging | The 5xx log line uses the route template or path instead of `request.url`, so query-string tokens are not logged |
| Workload | `test/load/seed-synthetic-data.ts` (guarded, deterministic, full profile) and `test/load/run-workload.ts` (open-loop request mix, distinct synthetic client addresses, metrics sampling). See [testing.md](testing.md#synthetic-workload) |

## Verification

All commands were run from `services/commerce-api` on 2026-10-02.

| Check | Status | Result |
| --- | --- | --- |
| Typecheck, lint, formatting, Swagger | fixed and verified | See the final-checks table below |
| Focused unit tests | fixed and verified | Metrics (histogram, service, middleware, scrape guard, Prometheus format, collector), lifecycle, job worker, outbox dispatcher, Prisma lifecycle, health and exception filter: 13 suites passed |
| Metrics access and labels (HTTP) | fixed and verified | `test/metrics.e2e-spec.ts`, 5 tests. Anonymous 401, customer 403 and admin 200 on JSON. Prometheus: 404 when unset; 401 with no token, a wrong token or an admin JWT; 200 text with the token. A guarded route rejected with 401 is labelled `/api/v1/admin/catalog/products/:id`. Unknown routes and body-parser 413s are labelled `unmatched`. The UUID, query token and email in request URLs never appear in the output |
| Graceful shutdown (process) | fixed and verified | `test/graceful-shutdown.e2e-spec.ts` on a listening server. During a 300 ms drain, readiness returns 503 and liveness 200. A 600 ms in-flight request completes with 200, and new connections are refused after close |
| PostgreSQL integration | fixed and verified | `npm run test:integration`: 44 migrations, 17 suites, 90 tests passed on the Compose PostgreSQL 17 service with the Prisma lifecycle change in place |
| First GitHub Actions run (B6) | externally blocked | `feat/backend-hardening` is pushed at `99a6b01`. `.github/workflows/backend.yml` triggers only on `pull_request`, pushes to `main` and `workflow_dispatch`, so no run exists for a branch push. The repository is private and `gh` is not installed, so no run status could be read. Unblock by opening a PR or dispatching the workflow, then record the revision, run URL and the PostgreSQL job result here |

### Final checks on the complete change set

| Command | Result |
| --- | --- |
| `npm run format:check` | passed |
| `npm run lint` | passed (0 problems) |
| `npm run typecheck` | passed |
| `npm run swagger:check` | passed, 296 endpoints and 377 schemas |
| `npm test` | 106 suites, 1,032 tests passed |
| `npm run test:e2e` | 12 suites, 41 tests passed. The OpenAPI count assertion moved from 295 to 296 for the Prometheus route |
| `npm run build` | passed; the generated contract matched the committed one |
| `git diff --check` | passed |

## Workload baseline (provisional, single host)

These numbers apply only to the revision, data, topology and machine below. They are a comparison baseline for Stages 12 and 13, not a capacity claim. Expected production traffic and hosting resources are still unknown, so the [provisional targets](remaining-hardening-plan.md#provisional-performance-and-recovery-targets) stay provisional.

### Environment

| Item | Value |
| --- | --- |
| Revision | `99a6b01` plus uncommitted Stage 6 changes, recorded as `99a6b01+uncommitted` |
| Host | Windows 11 Pro 10.0.26200; Intel Core i7-1255U (10 cores, 12 threads); 15.7 GB RAM. The load client ran on the same host and shared its CPU |
| Database | PostgreSQL 17.11 in the Compose test container on Docker Desktop (WSL 2 VM: 12 CPUs, 7.6 GiB). `shared_buffers` 128MB, `work_mem` 4MB, `effective_cache_size` 4GB, `maintenance_work_mem` 64MB, `max_connections` 100, `synchronous_commit` on, `random_page_cost` 4, `max_wal_size` 1GB. Defaults, untuned |
| API | One process, `node dist/main.js`, Node v24.18.0. Default Prisma pool (observed peak 14 busy connections). Workers enabled. `PAYMENTS_PROVIDER=pending`, local storage, SMTP pointed at unreachable `127.0.0.1:1`. The API was restarted before each step |
| Mode note | `NODE_ENV=test`, used only because Prisma auto-loads the developer `.env` (N8) and production mode would refresh FX rates externally at boot. The only other code path `NODE_ENV` changes is the notification mailer's mode, which the mix does not reach |

### Dataset

Seeded by `seed-synthetic-data.ts --reset` in 143 s: 50,000 products, 100,000 variants, offers, prices and stock records (every tenth variant nearly sold out), 100,001 users (one admin) with 100,000 addresses, 400,000 orders, 1,000,000 order lines (cubic best-seller skew) and 400,000 payments. Database size 921 MB.

### Request mix

| Group | Share | Operations |
| --- | --- | --- |
| catalog | 60% | product list (random page 1–50) 25%, search 10%, category list 10%, product detail with skewed popularity 15% |
| account | 20% | `GET /orders` 10%, `GET /users/me` 5%, `GET /orders/:id` 5% |
| cart | 10% | add 7%, remove 3% |
| checkout | 5% | `POST /checkout/buy-now`. The pending provider deterministically answers 503 after the order and reservation are created, and the order is then cancelled. 503/409 count as expected |
| auth | 5% | `POST /auth/login` (bcryptjs cost 12) |

200 pre-signed-in users. Open-loop at a fixed rate with a 10 s client timeout. Each step ran 300 s with the first 60 s excluded as warm-up; the 100 req/s steps ran 180 s and 90 s. "Unexpected" excludes the expected statuses above and 429; client timeouts and connection errors are unexpected.

### Step results

Latency is measured client-side over all operations.

| Step | Throughput | p50 | p95 | p99 | Unexpected | API CPU (% of one core) | RSS peak | Event-loop p99 (max window) | Peak in-flight | Prisma busy / waiting (peak) | DB container CPU (mean, incl. setup) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Full mix, 5 req/s | 5.0 | 106 ms | 597 ms | 1,020 ms | 0% | 26% | 245 MiB | 224 ms | 6 | 5 / 0 | 66% |
| Full mix, 10 req/s | 10.0 | 239 ms | 1,305 ms | 2,774 ms | 0% | 74% | 254 MiB | 606 ms | 15 | 6 / 0 | 91% |
| Full mix, 20 req/s | 20.0 offered | 1,766 ms | 10,004 ms | 10,013 ms | 6.6% | 128% | 419 MiB | 1,775 ms | 143 | 14 / 1 | 156% |
| No auth, 20 req/s | 20.0 | 88 ms | 302 ms | 377 ms | 0% | 60% | 371 MiB | 79 ms | 6 | 7 / 0 | 129% |
| Full mix, 100 req/s (180 s) | 100 offered | — | 10,010 ms | 10,015 ms | 99.0% | not sampled | — | — | — | — | 183% |
| Full mix, 100 req/s (90 s, rerun with error codes) | 100 offered | — | 10,014 ms | 10,037 ms | 98.9%: 5,310 ECONNREFUSED, 2,106 timeouts, 2 × 500 | not sampled | — | — | — | — | — |

Errors at 20 req/s with the full mix:

- 156 Prisma "Transaction already closed" errors, which surfaced as 500s on checkout and login.
- Client timeouts on login, checkout and cart.

The 5 req/s run initially counted 27 cart fallback adds (201) as unexpected; they are corrected here, and the runner now expects them. At 100 req/s, metrics sampling was itself refused, so no resource samples exist.

Per group, at the healthy steps (p50 / p95 / p99):

| Group | Full mix, 5 req/s | Full mix, 10 req/s | No auth, 20 req/s |
| --- | --- | --- | --- |
| catalog | 103 / 332 / 597 ms | 192 / 691 / 967 ms | 91 / 266 / 319 ms |
| account | 99 / 360 / 555 ms | 124 / 1,003 / 1,237 ms | 76 / 118 / 164 ms |
| cart | 104 / 466 / 705 ms | 116 / 1,687 / 2,024 ms | 82 / 113 / 138 ms |
| checkout (stubbed 503) | 346 / 709 / 1,014 ms | 518 / 3,292 / 4,456 ms | 318 / 411 / 667 ms |
| auth | 655 / 1,299 / 1,409 ms | 1,662 / 3,160 / 4,310 ms | not in mix |

### Queues

- **Jobs.** `inventory.expire_reservation` jobs (due 15 minutes after each checkout reservation) started with this eligible-to-start lag, measured server-side:
  - full mix at 10 req/s: p50 3.3 s, p95 8.2 s, p99 9.6 s (50 jobs);
  - no auth at 20 req/s: p50 2.8 s, p95 6.1 s, p99 9.2 s (140 jobs).

  This is within the provisional p95 ≤ 10 s, and is dominated by the 5 s poll interval. The oldest due-but-unstarted job never exceeded 0.8 s. Up to 508 future-dated jobs were pending.
- **Under overload,** 388 job and transaction failures were logged, and `expire_reservation` jobs failed on expired interactive transactions and were retried.
- **Outbox.** The mix's failed-checkout path records no outbox events, so outbox dispatch lag was not exercised. The metric exists and is unit-tested.

### Findings from the baseline

| ID | Finding | Evidence | Stage |
| --- | --- | --- | --- |
| N9 | **Password hashing blocks the event loop.** bcryptjs (pure JavaScript, cost 12) runs on the main thread. At 1 login/s (20 req/s full mix), event-loop p99 reached 1.8 s and every route degraded to timeouts. The same 20 req/s without logins stayed at p95 302 ms. A single login takes about 650 ms even at idle | full-20rps vs noauth-20rps | 12 (move hashing off the event loop without weakening cost) |
| N10 | **Interactive transactions expire under load.** Prisma's default 5 s interactive-transaction timeout is exceeded when the event loop or pool stalls, producing 500s (checkout, login) and failed `expire_reservation` attempts | 156 errors at 20 req/s, 388 at 100 req/s | 12 (coordinated statement, transaction and pool budgets), with Stage 7 for checkout |
| N11 | **No admission control.** Beyond capacity the API stops accepting connections (accept backlog overflow): 71% `ECONNREFUSED` and 28% timeouts at 100 req/s instead of controlled 429/503 responses. The metrics endpoint becomes unreachable at the same time | overload rerun | 13 |
| N12 | **Expected provider rejections are logged as errors.** Each stubbed-checkout 503 writes an `error` line with a stack trace through `AllExceptionsFilter`, as does readiness while draining. This hides real 5xx in logs | API error logs | 10 |

### Against the provisional targets

| Target | Observed | Met? |
| --- | --- | --- |
| 100 req/s steady mix | Collapses above roughly 10 req/s with logins in the mix; 20 req/s is healthy without logins | no |
| Read p95 ≤ 300 ms, p99 ≤ 1 s | Catalog 332/597 ms at 5 req/s full mix; 266/319 ms at 20 req/s without auth | only at low load or without logins |
| Local mutation p95 ≤ 700 ms | Cart 466 ms at 5 req/s; 113 ms at 20 req/s without auth | at low load |
| Checkout p95 ≤ 1 s (stub) | 709 ms at 5 req/s; 411 ms at 20 req/s without auth | at low load |
| Auth p95 ≤ 1.5 s | 1,299 ms at 5 req/s; 3,160 ms at 10 req/s | only at 5 req/s |
| Unexpected errors < 0.1% | 0% up to 10 req/s full mix | yes up to 10 req/s |
| Job lag p95 ≤ 10 s | 6.1–8.2 s | yes |
| 30-minute steady, 2-hour soak, 200 req/s spike, upload pressure | Not run; 5-minute steps only | deferred to Stages 12–13 |

### Follow-up implementation after this baseline

The baseline above predates the following local changes and remains the comparison point. Password hash and compare now run in a bounded two-thread worker pool at the same bcrypt cost (N9). A global guard limits ordinary requests to 16 in flight by default, responds 503 with `Retry-After: 1` above that limit, and keeps health and metrics available (initial N11 control). Intentional HTTP 503s no longer emit error stack traces (N12). Focused unit and HTTP tests pass.

A short follow-up full-mix run at 20 offered req/s used the same single-host database and 200-user pool, with 5 seconds warm-up and 30 seconds measured. With an admission limit of 64, it recorded 600 measured requests: p50 3,206 ms, p95 9,819 ms, 227 HTTP 503s and 26 client timeouts; the Prisma pool had up to 67 waiting queries. With a limit of 16, another 600-request run recorded p50 480 ms, p95 2,873 ms, 253 HTTP 503s, no connection errors or client timeouts, and no pool wait at the sample points. The second run still had 38.2% unexpected responses, so it does not meet the provisional target. These short runs use a reused database whose stock and background queues changed between runs; they justify a conservative initial limit, not a capacity claim. A repeat 100 req/s run and Stage 13 overload checks remain outstanding.

The guarded load API launcher now supplies inert provider settings. The hourly FX refresh also skips `NODE_ENV=test`, as its boot refresh already did, so long local load runs cannot send an FX request. A regression test covers both entry points. An attempted short 100 req/s follow-up never reached the API health gate and produced no workload result; it is excluded from this comparison.

### Reproducing

See [testing.md](testing.md#synthetic-workload) for the seed and runner commands. Each step set `LOAD_RPS`, `LOAD_DURATION_S`, `LOAD_WARMUP_S=60`, `LOAD_POOL_USERS=200` and, for the no-auth step, `LOAD_ONLY=catalog,account,cart,checkout`. Raw JSON results are not committed (`load-results/` is ignored); rerun with the same seed sizes and `LOAD_SEED=20261002`.
