# Receipt reversal verification — 2026-10-01

Scope: Step 4, safe goods-receipt reversal in the backend.

## Implemented behavior

- Reversing an original posted receipt creates one posted reversal. Repeating the request returns that same reversal; the receipt row lock serializes simultaneous requests.
- A reversal receipt cannot be reversed. The database also rejects changing a reversal row to `REVERSED`.
- PO received quantities decrement only when the line still holds at least the reversal amount. A database check forbids negative received quantities.
- Stock reduction, PO changes, receipt states, audit and outbox writes share one transaction. Any stock or PO conflict rolls back the whole reversal.
- Reversing a receipt on a deliberately `CLOSED_SHORT` PO preserves its terminal status, completion time and short-close reason.
- The forward-only migration checks for existing nested reversals, non-posted reversal rows and negative received quantities before adding constraints. Existing invalid rows require manual review.

## Verification

The isolated PostgreSQL 17 `commerce_test` database applied migration 44. All 17 integration suites and 90 tests passed. Procurement's nine database cases include a replay, two simultaneous reversals, rejection of a reversal receipt, database constraint enforcement, transactional rollback for stock and PO quantity conflicts, and closed-short status retention. The full backend unit suite passed 98 suites and 997 tests; the HTTP suite passed 9 suites and 32 tests. Typecheck, lint, formatting, Swagger consistency (295 endpoints and 367 schemas), and build also passed.

The first GitHub Actions execution remains separate external evidence.
