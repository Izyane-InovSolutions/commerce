# Remaining backend hardening plan

Prepared 2026-10-01; restored from the conversation on 2026-10-02.
Status: proposed implementation sequence. This document does not claim completion of the stages below.

## Scope and starting point

Continue after implemented Steps 1–5: the test baseline, safe stock adjustments, catalog history protection, receipt reversal and upload limits. Step 1 still needs its first successful remote CI run according to the recorded evidence. See the [acceptance matrix](../backend-acceptance-matrix.md) for verification boundaries.

This plan covers backend correctness, security, response time, durability, scalability and operational verification. Preserve the NestJS/Prisma/PostgreSQL architecture. Frontend changes and new product features such as promotions, auctions and recommendations are outside scope.

The [gap register](known-gaps.md) supplies candidate findings. Many are source reviews dated September 29–30, not reproduced failures. Recheck current code and add a meaningful regression before changing behavior. Do not rebuild existing email, outbox, reconciliation, S3 or authentication mechanisms because an old document says they are missing.

Stage numbers continue from 5 to distinguish this work from the earlier authentication plan. Deliver each stage in reviewable changes and track implementation separately from external verification.

## 6. Close evidence gaps and establish measurements

Status 2026-10-02: **partial.** Local implementation and evidence are recorded in the [Stage 6 verification](measurement-baseline-verification.md). The first remote CI run (B6) remains externally blocked.

**Implement / deliver**

- Reconcile contradictory register entries: the earlier media baseline still says there is no transport cap, cancellation text predates database verification, and deletion claims must distinguish protected catalog history from remaining attribute/warehouse paths. Preserve dated historical reports.
- Record the revision and first successful GitHub Actions run, including PostgreSQL integration. Keep remote execution outstanding until verified; continue independent local work meanwhile.
- Inventory routes, jobs, external calls and state transitions. Give untabled findings stable IDs and assign them to the stages below.
- Extend existing metrics with route-template latency histograms, error rates, event-loop delay, memory, DB pool/lock pressure, job/outbox depth and oldest-due age, retry/dead-letter counts, and unresolved payment/refund counts. Use bounded labels without user IDs, tokens or raw URLs.
- Restrict metrics to configured internal scraper or authenticated operational access. Verify liveness, readiness and graceful shutdown before adding missing behavior.
- Create synthetic data and a repeatable workload. Record resources, database settings, dataset sizes, revision and duration.

**Acceptance:** publish baseline p50/p95/p99 latency, throughput, errors, resource use and queue age. Metrics access and bounded-label checks pass. Keep missing remote CI evidence explicitly open.

**Areas:** metrics, logging, health, CI, test fixtures and documentation. Covers B6 and the initial S5 fix.

## 7. Fix transactional shopping and inventory races

**Implement / deliver**

- Remove inventory sweeps that open another transaction while their caller holds relevant locks. Reuse the caller's transaction or sweep before entering it, with consistent lock ordering.
- Bind checkout idempotency to principal, operation and canonical request fingerprint. Same key/body returns the original result; changed body returns 409. Persist in-progress and terminal outcomes, distinguishing definite rejection from unknown provider outcomes so retries cannot create duplicate orders or charges.
- Establish the key contract without silently breaking clients. If mandatory keys require a new contract, use an opt-in/versioned route and document legacy migration debt until frontend work is authorized.
- Make first-cart creation and guest merge concurrency-safe. Define cart quantity/stock behavior and revalidate at checkout. Bind delayed cart cleanup to checked-out versions/quantities so it cannot delete subsequent additions.
- Make default-address assignment and promotion atomic, backed by a database constraint where practical.

**Acceptance:** PostgreSQL races cover repeated checkout, reservation expiry, cart creation/merge and address writes. No duplicate order/charge intent, overselling, self-blocking transaction, lost new cart content or multiple defaults. Changed-body replay returns 409; injected failures roll back local effects.

**Areas:** inventory, checkout, cart, users, idempotency and migrations. Covers H13, H16, R4–R6.

## 8. Complete payment and refund state handling

**Implement / deliver**

- Map documented provider terminal states, including cancelled/expired, while preserving unknown outcomes. Reconcile initialization timeouts without a provider reference using a stable merchant request reference or explicit operator-resolution state.
- Durably record verified payment success even when fulfillment cannot proceed. For late success, atomically reacquire eligible stock if policy permits; otherwise record a visible refund-required exception and queue compensation. A failed inventory transition must not hide receipt of money.
- Implement refund and status calls against confirmed provider contracts. Persist operation IDs/idempotency keys before network calls; reconcile ambiguous outcomes before resubmission.
- Recover abandoned `PROCESSING` refunds using leases and reconciliation. Enforce cumulative refund limits under concurrency and apply order/ledger effects once.
- Verify payment webhook signatures over original bytes; validate merchant/reference/amount/currency, enforce provider-supported replay rules, and durably deduplicate accepted events. Polling and callbacks use the same transition logic.
- Keep network calls outside long database transactions: persist intent, perform the external operation, then conditionally complete local state.

**Acceptance:** duplicate/out-of-order callbacks, expiry races, late success, partial/concurrent refunds, timeout-after-success and crashes converge to accountable outcomes without duplicate financial effects. Contract tests pass; provider evidence remains a Stage 14 gate.

**Areas:** payments, orders, inventory and refund jobs. Covers H1–H5. If refund/status support is unavailable, automatic refunds remain externally blocked; an audited manual resolution path is not automatic completion.

## 9. Protect fulfillment, returns and seller accounting

**Implement / deliver**

- Enforce platform/seller ownership and stock-source rules for cancellation, packing, booking and dispatch. Every quantity guard accounts for booked and cancelled units.
- Route workflow-changing tracking events through shipment transition services so ordinary event writes cannot bypass stock/fulfillment effects.
- Make provisioning failures for unresolved paid lines visible. Treat only the expected unique constraint as a replay and enqueue reconciliation for missing fulfillment.
- Create an accountable refund path for every accepted return line, including platform-only lines. Restock the correct stock source without duplicate stock/refund effects.
- Reverse seller proceeds from held or available balances according to their lifecycle. Model already-paid deficits explicitly and restrict later payouts as policy requires; do not erase debt or invent funds to keep counters nonnegative.
- Isolate shipment polling errors. Persist carrier operation intent, move book/cancel calls outside transactions and recover ambiguous results. Authenticate enabled carrier webhooks and permit safe retry of failed deliveries. Handle uniqueness errors outside aborted transactions.

**Acceptance:** concurrent cancellation/booking/dispatch/return tests preserve stock, quantity and ledger invariants. Every paid line and refundable return has a valid workflow or visible exception. Crash/replay tests show one local effect; a failed carrier event does not block unrelated shipments.

**Areas:** fulfillment, shipments, returns, financials and carriers. Covers H8–H12, H14, S1, R2–R3. Live carrier behavior is a Stage 14 gate when only manual adapters exist.

## 10. Close security, API and configuration gaps

**Implement / deliver**

- Standardize authoritative actor/ownership checks for sensitive commands. Disallow seller self-approval of payouts/products; verify saved-seller visibility and product approval transitions.
- Route administrative/financial audit writes through the central service, transactionally with successful mutations. Cover returns, fulfillment and payouts. Redact nested sensitive metadata/logs, including contact/account values and tokens, using explicit safe-field policies where appropriate.
- Revalidate auth, cookie/CSRF, CORS, revocation and proxy-trust controls with negative-path tests. Enqueue signed-in password-change notification if still missing.
- Map known Prisma failures by operation and constraint to conflict/not-found/validation responses. Keep unexpected failures as server errors; correct misleading 422/501/502 envelopes and document Swagger contracts.
- Review attribute/warehouse deletion history, seller stock-source permissions, moderation invariants, admin status-filter validation and currency/warehouse consistency in operational totals.
- Validate consumed runtime options and update `.env.example` with placeholders. Resolve worker/provider drift; enforce ZMW FX base or implement correct configurable conversion. Reject incompatible production provider settings at startup.
- Review dependency findings, secret paths, body/request limits and abuse controls. Define production access requirements for metrics and API documentation.

**Acceptance:** role/ownership/self-approval/CSRF negative tests and audit rollback/redaction tests pass. Captured logs contain no tokens or sensitive account data. Reproduced API/configuration defects have regression tests, documented responses and safe migration behavior.

**Areas:** guards/auth, audit/logging, products/offers, users, reviews, operations, exceptions and config. Covers S2, S4–S9, R7 and remaining untabled integrity/API/configuration findings. S3 is already implemented and verified.

## 11. Verify durable workers, outbox and media lifecycle

**Implement / deliver**

- Audit handlers/subscribers for business idempotency and transactional enqueueing. Verify claims, lease renewal/reclaim and rejection of stale completion, including work exceeding a lease duration.
- Separate scheduler, job-worker and outbox controls so dedicated workers can drain queues without enabling all schedulers. Keep test background execution disabled unless explicitly controlled by the test.
- Bound concurrency, claim batches and retry budgets. Add jittered backoff, dead-letter visibility and audited retry procedures; classify retryable, permanent and ambiguous errors.
- Verify email retries, encryption expiry and redaction. SMTP acceptance followed by a crash may cause duplicate mail; document at-least-once delivery instead of claiming exactly-once SMTP.
- Implement recoverable media upload/finalization with stable object keys and retryable cleanup. A database transaction cannot atomically commit an S3 object. Reconcile abandoned pending assets/orphans after a grace period and check active references before deletion.

**Acceptance:** two-worker PostgreSQL and process-kill tests recover work around external effects/local completion. Stale workers cannot overwrite newer claims; database effects occur once. External duplicates are controlled or documented. Cleanup never deletes active referenced assets.

**Areas:** jobs/outbox/workers, email, storage/media and process entry points. Covers R1, R8–R9; financial/carrier handlers depend on Stages 8–9.

## 12. Improve measured response time and database efficiency

**Implement / deliver**

- Use Stage 6 evidence and query plans to identify slow endpoints, N+1 queries, excess joins/columns, lock waits and unbounded reads. Capture comparable before/after results.
- Add indexes justified by predicates/orderings and write cost; batch lookups, select fewer fields and shorten transactions without weakening consistency.
- Add stable bounded pagination and page-size ceilings. Preserve contracts through additive/versioned routes when a shape change would require frontend edits, and document migration debt.
- Coordinate request, provider, DB statement/lock and connection-acquisition budgets. Timeouts must not cause unsafe retries or leave unrecorded external outcomes.
- Cache only measured hot reads, with explicit keys, authorization scope, expiry and invalidation. PostgreSQL remains authoritative for price, stock and balances. Add Redis or other infrastructure only when justified by measured need and an operational decision record.

**Acceptance:** compare query counts, p50/p95/p99, pool waits and resources on identical datasets; meet agreed budgets while correctness tests pass. Query/response sizes remain bounded. Index migrations have tested deployment and rollback/forward-repair procedures.

**Areas:** query-heavy modules, Prisma indexes, pagination and optional caching. Covers unbounded-list findings and response-time requirements.

## 13. Demonstrate horizontal capacity and overload behavior

**Implement / deliver**

- Test separate API/worker roles, readiness and graceful draining. Multi-replica deployments use shared object storage and no user-visible dependency on one replica's local disk.
- Budget connections across API replicas, workers, migrations and operational headroom. Introduce pooling only when justified; verify transaction/advisory-lock compatibility.
- Enforce rate limits across replicas using a shared deployment-appropriate layer. Verify trusted-proxy handling against forwarded-address bypasses.
- Bound concurrent uploads and worker/provider calls. Enforce body/header/read timeouts, queue admission and controlled overload responses while preserving critical payment/refund reconciliation.
- Compare one, two and four replicas with declared CPU/memory/database budgets. Measure capacity gain, latency, bottlenecks and cost rather than assuming linear scaling.

**Acceptance:** steady/spike/soak tests meet agreed budgets without unbounded growth. Overload yields controlled 429/503 responses and recovery. Duplicate financial effects, overselling and lost work remain zero. Killing a replica preserves service and recoverable jobs within the agreed recovery target.

**Areas:** deployment, rate limiting, worker/upload admission and load harness. Depends on Stages 7–12; failures reopen the affected stage.

## 14. Verify enabled external providers end to end

**Implement / deliver**

- Prepare isolated staging with separate secrets, synthetic accounts, controlled recipients/buckets and provider sandboxes where available.
- Verify reset/verification email receipt, token expiry and retry behavior; verify S3 upload/read/delete permissions and cleanup against an isolated real bucket.
- Exercise supported payment success/failure/cancellation/refund, signature, timeout and rate-limit scenarios. Reconcile local amounts/currency/state against provider records.
- Certify only enabled, supported carrier/payout adapters. Manual adapters remain manual; new integrations require separately scoped implementation.
- Record credential ownership/rotation, relevant email DNS requirements, vendor quotas, network timeouts and incident procedures.

**Acceptance:** dated redacted evidence connects scenarios to local and provider outcomes. Unsupported operations remain blocked with named dependencies. Live email/financial actions require an explicitly approved recipient/account and test action.

**Areas:** provider adapters and staging. Preparation may start earlier; certification follows dependent code. Provider contracts, access, credentials and staging are external prerequisites.

## 15. Prove recovery and prepare release operations

**Implement / deliver**

- Implement encrypted database backups and platform-supported continuous log archival/point-in-time recovery. Include object storage and secure recovery access to required encryption/signing keys and configuration.
- Define retention for sessions, tokens, jobs, outbox, audit and media from business requirements. Purge in bounded batches without deleting unresolved financial evidence.
- Restore to a fresh isolated environment. Verify schema, stock/order history, balances, sessions, encrypted delivery data and media references. Reconcile external provider outcomes before restarting workers to prevent duplicate effects after restore.
- Exercise restarts, database outages, disk pressure, failed migrations and provider failures. Document startup order, lease recovery, readiness, incident triage and rollback/forward repair.
- Add deployment automation with immutable build identification, migration gates, smoke tests, gradual rollout and alerts. Test alert routing without unsolicited external messages.
- Run release-candidate CI, agreed load tests, restore drill and provider review. Record exceptions, owners and release impact.

**Acceptance:** measured data-loss window and restore duration satisfy agreed RPO/RTO; restored business totals and provider reconciliation agree. Alerts/runbooks are exercised. The release record distinguishes passing evidence, deferred features and blockers.

**Areas:** deployment, database/storage operations, secrets and release documentation. Approving this plan does not authorize production rollout.

## Provisional performance and recovery targets

These are proposed test targets, not measured capacity or a production promise. Stage 6 must confirm expected traffic and hosting resources before finalizing acceptance. If unavailable, retain this profile for comparison and label results provisional.

| Measure | Initial target |
| --- | --- |
| Synthetic dataset | 100,000 variants, 100,000 users, 1 million order lines; realistic stock skew and enough accounts to avoid accidental per-user throttling |
| Steady request mix | 100 requests/s: 60% catalog reads, 20% order/account reads, 10% cart writes, 5% checkout, 5% auth; deterministic provider stubs |
| Read latency | p95 <= 300 ms; p99 <= 1 second |
| Local mutation latency | p95 <= 700 ms; p99 <= 2 seconds |
| Checkout latency | p95 <= 1 second; p99 <= 2.5 seconds with declared stub latency; report real provider-inclusive latency separately |
| Authentication latency | Separate measurement including hashing; initial p95 <= 1.5 seconds without weakening password hashing |
| Unexpected errors | < 0.1% under steady load; count expected validation/auth/rate-limit responses separately |
| Job/outbox lag | p95 eligible-to-start <= 10 seconds; delayed work measured from due time |
| Duration | 30-minute steady, 2-hour soak and 200 requests/s spike for 5 minutes |
| Upload pressure | Separate 5-concurrent-upload profile at configured cap plus oversized/slow uploads; report RSS and ordinary-request impact |
| Resources | No unbounded memory/connection/backlog growth; set explicit host-specific budgets in Stage 6 |
| Recovery | Proposed RPO <= 15 minutes and RTO <= 60 minutes, subject to hosting capability and business agreement |

Use dedicated infrastructure/test databases with existing `_test` safeguards. Stub external providers except for explicitly scoped Stage 14 verification. Capacity results apply only to the recorded revision, data, topology and allocated resources.

## Delivery and completion rules

1. Start with Stage 6, then Stage 7. Correctness precedes optimization. Provider preparation and backup design may proceed independently. Missing remote evidence does not stop unrelated local work.
2. Record reproduction/correction, implementation, migration impact, commands/results, revision and date per finding. Use source-confirmed, reproduced, fixed and verified, externally blocked and deferred statuses.
3. Run relevant regression/static checks, PostgreSQL tests for transaction behavior and process tests for crash/replica behavior. Full CI is required for the release candidate. Mocked tests cannot certify live providers or restoration.
4. Update Swagger, module docs, the register and acceptance matrix. Preserve frontend compatibility or explicitly version new contracts; do not edit frontend apps under this plan.
5. Test migrations on fresh and representative existing data. Resolve invalid data explicitly without silently dropping financial/stock history; document rollback limits and forward repair.
6. Close a stage only after its acceptance gates pass. Report implemented code with pending external evidence as partial. Production readiness requires the applicable final gates and explicit disposition of remaining critical gaps.

## Inputs needed before dependent work

- Expected peak traffic, growth, launch regions, hosting topology and budget: needed for final capacity targets, not initial correctness fixes.
- Approved late-payment/stock-reacquisition and post-payout refund-deficit policies before shipping those business transitions.
- Current provider contracts and sandbox access before provider-specific signatures/refund/status implementation or certification.
- GitHub runner access and an authorized remote revision for independent CI evidence.
- Staging, approved test recipients/accounts and backup storage for provider/load/recovery verification.
- Business agreement on recovery objectives and retention before operational sign-off.
