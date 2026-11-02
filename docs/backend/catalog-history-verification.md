# Catalog history verification — 2026-10-01

Scope: Step 3, preservation of order and stock history during backend catalog deletion. No frontend, live-provider or deployment changes are included.

## Implemented behavior

- Product, variant and first-party offer deletion locks the affected catalog and inventory rows before deciding whether deletion is safe.
- Purchase history, inventory movements, reservations or nonzero stock return `409 Conflict` with guidance to archive the record. A concurrently removed target returns `404 Not Found`.
- Empty stock records and other unused catalog records remain deletable.
- `OrderItem -> Offer`, `InventoryMovement -> InventoryRecord` and `Reservation -> InventoryRecord` use `ON DELETE RESTRICT`. These database constraints preserve history if a concurrent write arrives around a service-level check.
- The forward-only migration checks for orphaned historical rows before replacing the foreign keys.
- Seller product and variant deletion use the same protected product path. Seller offers do not expose a hard-delete endpoint.

## Verification

The disposable Docker Compose PostgreSQL 17 volume was recreated before the complete run.

| Check | Result |
| --- | --- |
| Fresh migrations | 43/43 applied |
| Step 3 PostgreSQL cases | 6/6 passed |
| Complete PostgreSQL integration suite | 17 suites, 85 tests passed |
| Backend unit suite | 98 suites, 995 tests passed |
| HTTP suite | 9 suites, 32 tests passed |
| Typecheck, lint and formatting | Passed |
| Swagger consistency | Passed at 295 endpoints and 367 schemas |
| Backend build | Passed |

The focused PostgreSQL cases cover unused offer and variant deletion, empty stock cleanup, order-item retention, inventory-movement retention, reservation retention and a controlled concurrent order-item insertion against offer deletion. Existing integration teardown now removes historical rows explicitly, which verifies that warehouse and offer cascades can no longer erase them.

The first GitHub Actions execution remains external evidence that requires a push or pull request.
