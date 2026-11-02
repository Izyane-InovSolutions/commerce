# Stock adjustment verification — 2026-09-30

Scope: Step 2, safe and auditable admin stock adjustments. No frontend, deployment, live-provider or production-database changes are included.

## Implemented behavior

- `POST /api/v1/admin/inventory/adjust` keeps its request and response body shape and accepts an optional UUID-v4 `Idempotency-Key` header.
- Inventory-record creation, row lock, counter update, signed movement, actor audit and optional retry receipt commit in one transaction.
- The resulting `onHand` must be within the PostgreSQL integer range and at least `reserved`. Database checks also enforce nonnegative `onHand` and `reserved` counters.
- The audit row contains the authenticated actor, movement ID, signed delta, supplied note when present, request metadata and before/after counters.
- Retry receipts are scoped to actor and key. An identical retry returns the first response; a different request with the same key returns `409`. A concurrent losing insert rolls its transaction back and reads the winning receipt outside the failed transaction.
- New `ADJUSTMENT` movements retain direction, including negative receipt reversals. Historical rows are not rewritten.

## Verification

The disposable Docker Compose PostgreSQL 17 volume was recreated before the complete run.

| Check | Result |
| --- | --- |
| Fresh migrations | 42/42 applied |
| Step 2 PostgreSQL cases | 8/8 passed |
| Complete PostgreSQL integration suite | 16 suites, 79 tests passed |
| Backend unit suite | 98 suites, 985 tests passed |
| HTTP suite | 9 suites, 32 tests passed |
| Typecheck, lint and formatting | Passed |
| Swagger consistency | Passed at 295 endpoints and 367 schemas |
| Backend build | Passed |

The PostgreSQL cases cover `onHand=10`, `reserved=8`, `delta=-5`; database constraint enforcement; signed movements and actor audit; identical and conflicting retries; simultaneous duplicate requests; competing reductions at the reserved floor; keyless compatibility; integer overflow; and rollback when audit writing fails.

The first GitHub Actions execution remains external evidence that requires a push or pull request.
