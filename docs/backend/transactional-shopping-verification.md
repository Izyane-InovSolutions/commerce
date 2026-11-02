# Stage 7 verification: transactional shopping and inventory safety — 2026-10-16

Scope: Stage 7 of the [remaining hardening plan](remaining-hardening-plan.md#7-fix-transactional-shopping-and-inventory-races), covering H13, H16, R4, R5 and R6 in the [gap register](known-gaps.md). The source checkpoint is `09209b9` (the committed Stage 7 draft) plus the uncommitted Stage 7 changes in `services/commerce-api`. Status words follow the [register policy](known-gaps.md#evidence-and-status-policy). No frontend, deployment, live-provider (Stage 8) or performance (Stages 12–13) work is included, and no transaction timeout was raised.

**Stage status: TBD**

## Implemented behavior

### Checkout idempotency

- `Idempotency-Key` stays **optional** on `POST /api/v1/checkout` and `POST /api/v1/checkout/buy-now`. When present it must be a UUID v4 (else 400). It is lowercased, so the same key in either letter case names the same checkout. Receipts are scoped to `(userId, key)`, so two customers can use the same key independently.
- A keyless request creates no receipt and behaves as before: every submit is a new checkout (see [limitations](#remaining-limitations)).
- A keyed request runs under a `checkout_attempts` row. The receipt stores an HMAC-SHA256 fingerprint of the normalized request (v1), signed with the active key of `CHECKOUT_FINGERPRINT_KEYS` together with its key id and version ([checkout-fingerprint.ts](../../services/commerce-api/src/modules/checkout/checkout-fingerprint.ts)). The normalized request is built from the validated DTO and includes payment details in full. Raw payment details are never persisted, and neither is the order's internal cart snapshot.
  - Cart checkout normalizes to `{operation: 'cart', shippingAddressId, currency, itemIds, paymentDetails}`. `itemIds` is lowercased, de-duplicated and sorted; absent means the whole cart, and an explicit `[]` is a different request.
  - Buy-now normalizes to `{operation: 'buy-now', offerId, quantity, shippingAddressId, currency, paymentDetails}`.
  - The order is built from the normalized values, so two requests that fingerprint alike cannot execute differently.
- Same key and same request:
  - `COMPLETED` replays the stored response. The column is `json`, so the response `data` is byte-identical to the first one. No provider call, order or reservation is made.
  - `REJECTED` replays the stored HTTP status and body.
- Only a definite refusal (an HTTP error below 500) is recorded as `REJECTED`. A 5xx or non-HTTP failure is never recorded as a rejection while the outcome could still change.
- An executing request owns its attempt through an owner token and a 120-second lease (`CHECKOUT_ATTEMPT_LEASE_MS`). The lease is renewed when the order is linked and again when payment starts. Every owner write is fenced on the token:
  - The order link is a conditional update inside the order transaction (owner, `IN_PROGRESS`, no order linked yet).
  - The Payment insert runs in one transaction: the attempt guard (a fenced `markPaymentStarted`), then the `orders` row lock, then a check that the order is still `PENDING_PAYMENT` (else 409 `CHECKOUT_EXPIRED`, no payment), then the insert ([payments.service.ts](../../services/commerce-api/src/modules/payments/payments.service.ts)). Cancelling takes the same order lock, so an order is either cancelled or has a payment row, never both.
  - A request that lost its attempt gets 409 `CHECKOUT_IN_PROGRESS`, writes nothing and creates no payment. A unique violation on the order's `(userId, idempotencyKey)` under a fence is treated the same way.
- Crash recovery when a retry finds an `IN_PROGRESS` attempt whose lease has lapsed:
  - If the linked order already has a Payment row, the provider may have been called. The attempt becomes `BLOCKED` and the retry gets `CHECKOUT_REQUIRES_RECONCILIATION`; it never submits again. A payment that is `FAILED`/`CANCELLED` is the exception: its order is cancelled (if still pending) and the key becomes `REJECTED` with `CHECKOUT_PAYMENT_FAILED`.
  - Otherwise the retry claims the attempt with a compare-and-set on the owner token it read and on the lease still being lapsed.
    - With no order linked, it runs the checkout from the start.
    - With an order that is `PENDING_PAYMENT` and still holds every reservation `ACTIVE` and unexpired, it continues at payment initialization with that order: one payment, one provider call.
    - Otherwise it cancels the order (if still pending) and records `REJECTED` `CHECKOUT_EXPIRED`.
- Failure classification after a keyed execution throws. It writes nothing unless the attempt is still `IN_PROGRESS` with this request's owner token ([checkout-attempts.service.ts](../../services/commerce-api/src/modules/checkout/checkout-attempts.service.ts)).
  - No order linked: definite → `REJECTED`; otherwise the attempt is released so a retry can resume at once.
  - Order linked, no Payment row: order cancelled or definite → `REJECTED`; otherwise released.
  - Payment `FAILED`/`CANCELLED` → `REJECTED`.
  - Any other Payment status → `BLOCKED`.
- After a payment error, checkout releases the order's stock only when no charge can follow. That means the Payment row is `FAILED`/`CANCELLED`, or there is no row and either the error is definite or the request is keyless. A pending payment, or a transient error that a same-key retry will resume, keeps the order and its reservations.
- Legacy receipts are refused with 409 `CHECKOUT_KEY_LEGACY_RECEIPT` and are never executed or replayed. Before Stage 7 the key was stored verbatim, so the lookups are case-insensitive and scoped to the user. A legacy receipt is any of:
  - an order that carries the key in any letter case (checked out before attempt receipts existed);
  - a draft-era attempt stored in another letter case;
  - an attempt with no fingerprint metadata;
  - an attempt whose fingerprint key id is no longer in the ring.

**Error codes.** Every code below is a 409. The machine-readable code travels in `error.details` of the standard error envelope as `{ "field": "code", "message": "<CODE>" }`; `error.code` stays the generic status code. References are added as `{ "field": "orderId" | "paymentId", "message": "<uuid>" }` when known ([checkout-attempt.errors.ts](../../services/commerce-api/src/modules/checkout/checkout-attempt.errors.ts)).

| Code | Returned when | `details` fields |
| --- | --- | --- |
| `CHECKOUT_KEY_REUSED` | The key already has an attempt for the other operation (cart vs buy-now) or for a request with a different fingerprint | `code` |
| `CHECKOUT_KEY_LEGACY_RECEIPT` | The key belongs to a legacy receipt (see above). Nothing is created or executed | `code`, `orderId` when the receipt has one |
| `CHECKOUT_IN_PROGRESS` | Another request holds a live lease, a concurrent retry won the claim, or this request lost its attempt during a fenced write | `code`; `orderId` and `paymentId` when known (none for a request that lost its attempt) |
| `CHECKOUT_REQUIRES_RECONCILIATION` | The attempt is `BLOCKED`: a Payment row exists and the provider may have seen it. Check the order and payment instead of checking out again | `code`, `orderId`, `paymentId` |
| `CHECKOUT_EXPIRED` | A resumed attempt's order no longer holds all its reservations, so the order is cancelled and the key records this rejection. Also returned by the Payment insert when the order is no longer `PENDING_PAYMENT` | `code`, `orderId` |
| `CHECKOUT_PAYMENT_FAILED` | An unfinished or `BLOCKED` attempt whose payment is `FAILED`/`CANCELLED` and whose order is (or is now) cancelled. Nothing was charged; start a new checkout with a new key | `code`, `orderId`, `paymentId` |

**Attempt states and stages** (database CHECK constraints from migration `20261015090000`):

| Status | Meaning | Lease/owner |
| --- | --- | --- |
| `IN_PROGRESS` | Executing, or released for a retry to resume | Set while owned; both cleared when released |
| `COMPLETED` | Response recorded; replays verbatim. Requires `response` and `order_id`. Its write is keyed on the order, so it also overrides `BLOCKED` | Cleared |
| `REJECTED` | Definite failure recorded; replays its status and body. Requires `response` and `error_status` 400–599 | Cleared |
| `BLOCKED` | A Payment row exists with an unknown outcome; the key never starts another payment. Requires `order_id` | Cleared |

The stage moves `RECEIVED` → `ORDER_CREATED` (order linked in the order transaction) → `PAYMENT_STARTED` (inside the Payment insert transaction) → `FINISHED` (`COMPLETED` or `REJECTED`).

### Unpaid orders, cancellation and resumption

- **Reaper.** Every order transaction (cart and buy-now, keyed and keyless) enqueues `orders.expire_unpaid` for the reservation TTL plus 60 s, with 20 attempts. In one transaction the handler locks the linked attempt, then the orders row. It does nothing if the order is no longer `PENDING_PAYMENT` or a Payment row exists, and retries while the attempt holds a live lease. Otherwise it cancels the order, releasing its reservations, and records the attempt `REJECTED` with the `CHECKOUT_EXPIRED` body. Locking the attempt before the order matches the Payment-insert transaction, so the two cannot deadlock: whichever takes the attempt lock first wins.
- **Payment insert versus cancellation.** A Payment row is only ever created while its locked order is `PENDING_PAYMENT`. Customer and staff cancellation re-reads the payment after taking the same order lock. If it changed since the unlocked read, cancellation answers 409 'Payment is starting; retry cancellation', and the retry takes the payment-aware path. An order is therefore never cancelled by that path while its new payment is being submitted.
- **Resumption needs time left.** A same-key retry resumes an order only if every reservation outlives now plus `CHECKOUT_RESUME_MIN_RESERVATION_MS` (5 minutes). Otherwise it cancels and answers `CHECKOUT_EXPIRED`, so a redirect payment cannot complete against reservations that already lapsed.

### Lock order

Every path follows one global order and never locks backwards:

`users` → `checkout_attempts` → `carts` (ascending id) → `orders` → `offers` (`FOR KEY SHARE`, ascending id) → `inventory_records` (ascending id) → `reservations` (ascending id)

- **Order transaction** ([orders.service.ts](../../services/commerce-api/src/modules/orders/orders.service.ts)). The new `orders` row is uncontended. The transaction then:
  1. links the attempt (fenced);
  2. locks the user's cart row and re-verifies the cart snapshot (cart checkout only);
  3. takes `FOR KEY SHARE` on every offer, so the later order-item foreign keys never lock an offer after an inventory record;
  4. locks every inventory record of the affected stock pools in ascending id;
  5. creates seller orders, shipping groups and order items;
  6. reserves every item in the canonical cart-line order `(createdAt, id)`;
  7. enqueues the cart cleanup job (cart checkout only).

  Reservations are restricted to the records locked in step 4. A record created after that lock is ignored rather than locked out of order. Allocation is unchanged: each line is served whole by the first record in ascending id with enough stock, never split across warehouses.
- **Payment insert:** the attempt guard, then the `orders` lock, then the insert.
- **`confirmPayment` / `cancel`:** the `orders` lock, then `commitMany` / `releaseMany`. These lock every affected inventory record in ascending id, then every reservation in ascending id, and keep the single-item semantics: release is idempotent; commit of `COMMITTED` is a no-op, and of anything else other than `ACTIVE` it is 409.
- **`reserve` sweep, `expireReservation`, single `release` / `commit`:** inventory record, then reservation. The sweep and expiry run in the caller's transaction (H16, R5).
- **Other multi-record stock writers** lock their existing records in ascending id before the first per-line write (`lockRecordsForWrite`): seller bulk inventory update (offers `FOR KEY SHARE` first; writes follow record id), goods-receipt posting and reversal, fulfillment cancellation restock, and return-inspection restock.
- **Cart mutations** lock cart rows only; stock is read without locks. **Address mutations** lock the `users` row only.

### Cart

- Every mutation runs in one transaction that locks its cart row `FOR UPDATE` and re-reads the cart's status and quantities under the lock: add, set quantity, remove, clear, remove selected lines, merge, and cleanup. An add, update or remove on a cart that is no longer `ACTIVE` answers 409 `Cart is no longer active`; clear and remove-selected become no-ops. Missing carts and lines keep their 404s.
- The first cart for a user is created under a `users` row lock, so concurrent first adds create exactly one cart. The unique `userId` index remains the backstop. Guest cart creation is unchanged.
- An add, a quantity increase or a guest merge that leaves the cart wanting more than checkout could reserve is rejected with 409 `Requested quantity exceeds available stock` and changes nothing. `details` carries `{field: 'offerId'}` (an increased offer in the short pool) and `{field: 'available'}` (the pool's total allocatable quantity, as a string).
  - Allocatable stock counts lapsed `ACTIVE` reservations as free, because checkout sweeps them.
  - The check simulates checkout's first-fit allocation in the same `(createdAt, id)` order. A pool whose total exceeds the demand can still refuse a line that no single record can hold.
  - Only pools whose demand increased are checked. Decreases and removals always succeed, even on a cart that is already short.
- A resulting line quantity above 2,147,483,647 (PostgreSQL `integer`) is rejected with 409 `Cart quantity is too large`.
- Guest merge locks both carts in ascending id and is all or nothing: a shortage or overflow rolls the whole merge back, and both carts stay as they were. A guest cart is consumed exactly once; a concurrent second merge finds it `MERGED` and returns the user's cart unchanged.
- `cart_items.revision` increments on every quantity write to an existing line, including same-quantity edits and merges.
- Cart contents never reserve stock; checkout stays authoritative.
  - Checkout captures a snapshot `{id, offerId, quantity, revision}` of the selected lines only, from the same read it prices.
  - Inside the order transaction it locks the cart row and rejects any missing or changed line with 409 `Cart changed; review your cart and check out again`.
  - A line whose stock fell after the cart accepted it is refused by checkout's own reservation, and the cart is kept.

### Cart cleanup

- The order transaction enqueues `cart.cleanup_items {userId, orderId}` at +60 s with `maxAttempts` 20 for every cart checkout. If that enqueue fails, the whole checkout rolls back: 500, no order, no reservation, no provider call. A retry with the same key then succeeds.
- `confirmPayment` enqueues the same job again for an order with a cart snapshot, so a payment that settles later (webhook, status route, reconciliation) still cleans the cart.
- After the response is recorded, checkout also runs the cleanup inline as a best effort.
- An enqueue failure never fails a checkout that has already been accepted. This covers a failed inline cleanup, and a failed `confirmPayment` enqueue for a payment that settles inline. In the second case the settlement is not applied and the payment awaits reconciliation.
- `cleanUpCheckout` deletes only cart lines that still match the order's snapshot by id, quantity and revision. A line added, edited (even back to the same quantity) or removed and re-added after checkout is kept. It is idempotent, and it waits for the payment outcome:
  - no Payment row while the order is `PENDING_PAYMENT` → retry;
  - no Payment row and the order is cancelled → done, cart kept;
  - payment `FAILED`/`CANCELLED` → done, cart kept;
  - no provider reference and not `SUCCEEDED` → retry (awaits reconciliation).
- Snapshots from the 09209b9 draft (entries without `offerId`) are still matched by id, quantity and revision. Orders without an array snapshot, and legacy job payloads without `orderId`, delete nothing; the job completes.

### Addresses

- `create`, `update`, `setDefault` and `remove` each run in one transaction that first locks the `users` row; ownership is checked inside it ([addresses.service.ts](../../services/commerce-api/src/modules/users/addresses/addresses.service.ts)).
- A user with at least one address has exactly one default:
  - The first address is the default.
  - The DTOs have no `isDefault` field, so the default moves only through `setDefault` (which unsets the old default first) or through promotion.
  - Deleting the default promotes the most recently updated remaining address, with id as the tie-breaker.
  - `create` and `remove` also repair a legacy user with addresses but no default.
- The partial unique index `addresses_one_default_per_user` (migration `20261008000000`) rejects a second default per user in the database.

### Configuration

`CHECKOUT_FINGERPRINT_ACTIVE_KEY_ID` and `CHECKOUT_FINGERPRINT_KEYS` are required; startup fails when either is missing or invalid. See [configuration.md](configuration.md#checkout).

## Migrations

| Migration | Content |
| --- | --- |
| `20261008000000_transactional_shopping` | Committed with the draft and unchanged. Adds the partial unique index `addresses_one_default_per_user`, `cart_items.revision` (default 0) with `CHECK (quantity > 0)`, `orders.checkout_cart_snapshot` (`jsonb`) and the `checkout_attempts` table. It fails on duplicate default addresses or a non-positive cart quantity, and PostgreSQL then reports only a generic error |
| `20261015090000_checkout_attempt_receipts` | Stage 7 follow-up. A `DO` block preflight first raises with the offending IDs for duplicate defaults, cart lines with non-positive quantity or negative revision, attempts referencing missing users, attempts referencing missing or other users' orders, and attempts with an invalid recorded outcome. It then adds fingerprint metadata, `stage`, `owner_token`, `lease_expires_at` and `completed_at`; converts `response` to `json` (values converted as-is); adds CHECK constraints for status, stage, operation, fingerprint metadata, lease pairing and recorded outcome; adds foreign keys to `users` (cascade) and `orders` (no action); and adds `cart_items_revision_nonnegative` |

Existing rows are not deleted or rewritten. New columns take their defaults (`revision` 0, `stage` `RECEIVED`, other new columns NULL). Draft-era attempts keep NULL fingerprint metadata and answer `CHECKOUT_KEY_LEGACY_RECEIPT`.

[`scripts/check-transactional-shopping-preflight.cjs`](../../services/commerce-api/scripts/check-transactional-shopping-preflight.cjs) runs the checks of both migrations read-only, in one `READ ONLY, REPEATABLE READ` transaction, and prints each offending row grouped per check. It skips checks on tables that do not exist yet. Users with addresses but no default are reported as a warning that does not affect the exit code; the application repairs them on the next address create or remove. Exit codes: 0 nothing found, 1 offending rows found, 2 could not run.

## Forward repair

When either Stage 7 migration fails on existing data:

1. Run the preflight against the affected database. It needs `DATABASE_URL` and changes nothing:

   ```powershell
   $env:DATABASE_URL='postgresql://...'
   node scripts/check-transactional-shopping-preflight.cjs
   ```

   The committed `20261008000000` migration fails with only a generic constraint or index error and names no rows. The preflight script exists to name them.
2. Repair the reported rows deliberately, one decision per row: for example choose the one default address to keep, or correct or remove a non-positive cart line. Never bulk-delete order, payment, address or attempt history to make a migration pass. Rerun the preflight until it exits 0.
3. Mark the failed migration rolled back:

   ```powershell
   npx prisma migrate resolve --rolled-back <migration_name>
   ```

4. Deploy again:

   ```powershell
   npx prisma migrate deploy
   ```

A failed migration changes no data or schema; each Stage 7 migration runs as one statement batch. Until step 3, any later `migrate deploy` is refused with `P3009`. The DO block in `20261015090000` stops at the first failing check, so a repair can take several deploy/resolve rounds. The preflight script reports every category at once, so repair from its output, not from the migration error.

`test/transactional-shopping-migration.integration-spec.ts` runs this procedure with the repairs below. They are examples of deliberate, per-row decisions, not a script to run unreviewed. `<ids>` are the IDs the preflight reported.

| Reported category | Repair used in the test |
| --- | --- |
| Users with more than one default address | Keep each user's most recently updated default (id as tie-breaker): `UPDATE addresses SET is_default = false, updated_at = CURRENT_TIMESTAMP WHERE id = ANY(<ids>) AND id NOT IN (SELECT DISTINCT ON (user_id) id FROM addresses WHERE id = ANY(<ids>) ORDER BY user_id, updated_at DESC, id ASC)` |
| Cart lines with non-positive quantity | `DELETE FROM cart_items WHERE id = ANY(<ids>) AND quantity <= 0`. A cart line is not order history. |
| Cart lines with a negative revision | `UPDATE cart_items SET revision = 0 WHERE id = ANY(<ids>) AND revision < 0` |
| Attempts referencing missing users, or missing or foreign orders | Quarantine, do not delete. In one transaction: `CREATE SCHEMA IF NOT EXISTS stage7_repair; CREATE TABLE IF NOT EXISTS stage7_repair.checkout_attempts (LIKE public.checkout_attempts); INSERT INTO stage7_repair.checkout_attempts SELECT * FROM public.checkout_attempts WHERE id = ANY(<ids>); DELETE FROM public.checkout_attempts WHERE id = ANY(<ids>);` |
| Attempts with an invalid recorded outcome (REJECTED without a status) | Restore the status the stored body already carries: `UPDATE checkout_attempts SET error_status = (response->>'statusCode')::int WHERE id = ANY(<ids>) AND status = 'REJECTED' AND error_status IS NULL AND (response->>'statusCode')::int BETWEEN 400 AND 599` |

Users who have addresses but no default are reported as a warning only. They do not stop a deploy, and the next address mutation for that user promotes a default.

## Remaining limitations

- **Keyless checkouts have no retry protection.** Two submits without a key create two orders and two payment initializations.
- **Distinct keys are distinct checkouts**, even for the same cart and body. A client that mints a new key per retry loses the protection.
- **Cart contents never reserve stock.** Checkout is authoritative. The cart's stock check reads without locks, so a concurrent change can still make a later checkout reject a cart that was accepted.
- **A `BLOCKED` attempt is not resolved automatically.** The customer or staff reconcile it through the order and payment APIs; the key keeps answering `CHECKOUT_REQUIRES_RECONCILIATION` even after the payment succeeds. The only automatic exit is a payment that later turns out `FAILED`/`CANCELLED`, which a same-key retry converts to `CHECKOUT_PAYMENT_FAILED`.
- **An abandoned recoverable attempt holds stock until the reaper runs.** If a keyed request fails transiently after its order commits and the customer never retries, the order stays `PENDING_PAYMENT` without a payment for up to the reservation TTL plus 60 s (about 16 minutes). `orders.expire_unpaid` then cancels it, and the key answers `CHECKOUT_EXPIRED`. Until then the shopper's own unpaid order can make a new-key checkout for the last units fail.
- **One unlocked payment read remains after a failed keyed request.** `CheckoutService` decides whether to cancel after a payment-start failure from an unlocked payment read. It can only be stale if the request outlived its 120 s lease and a resumed retry inserted a payment in that window. the customer can also cancel it. Its cleanup job retries "not yet recorded" and dead-letters after 20 attempts.
- **An unresolved payment initialization keeps the cart.** A payment with an unknown outcome and no provider reference keeps the cart until it is reconciled. Unknown initialization without a reference is itself unresolved today (H2).
- **The cleanup job gives up after 20 attempts.** It then dead-letters and the cart is preserved, which is the safe failure.
- **Retired fingerprint keys must stay in the ring.** A receipt whose key was removed answers `CHECKOUT_KEY_LEGACY_RECEIPT` instead of replaying.
- **One deadlock pair remains with product hard delete.** A stock write that creates a new platform inventory record (goods receipt, return restock or fulfillment cancellation into a warehouse with no record yet) takes `FOR KEY SHARE` on the variant only at insert time. Variants are not pre-locked, so this can still deadlock against a product hard delete, which locks variants, then offers, then inventory records. PostgreSQL aborts one side.
- **A narrow race can block a live owner.** A retry that read a lapsed lease just before the owner renewed it can write `BLOCKED` without an owner fence once it sees the owner's new Payment row. The owner's completion still overrides `BLOCKED`. If that payment instead fails, the key stays `BLOCKED` until a retry converts it to `CHECKOUT_PAYMENT_FAILED`.
- **B6 is still open.** The first remote CI run remains externally blocked; see [known-gaps.md](known-gaps.md#current-verification-gates).
- **Other gates are separate.** Production deployment, frontend migration to send `Idempotency-Key`, and the provisional 100 req/s capacity target are not covered by this stage.

## Verification

Commands were run from `services/commerce-api` on 2026-10-16.

**Test environment.** Docker is not installed on this machine, so local runs did not use the Compose service. They used a disposable PostgreSQL 17.6 cluster created with `initdb`, with trust authentication, listening on loopback port 54329. Port 55432 falls inside a Windows reserved port range here. Each area used its own isolated database: `commerce_checkout_test`, `commerce_inventory_test`, `commerce_cart_test`, `commerce_address_test` and `commerce_migration_test`. CI provisions its own PostgreSQL 17 service.

| Check | Command | Result |
| --- | --- | --- |
| Revision | `git rev-parse HEAD` plus uncommitted Stage 7 changes | TBD |
| Fresh migrations | `prisma migrate deploy` on an empty database | TBD |
| Typecheck | `npm run typecheck` | TBD |
| Lint | `npm run lint` | TBD |
| Format | `npm run format:check` | TBD |
| Swagger | `npm run swagger:check` | TBD |
| Unit suite | `npm test` | TBD |
| HTTP suite | `npm run test:e2e` | TBD |
| PostgreSQL integration suite | `npm run test:integration` | TBD |
| Stage 7: checkout idempotency | `test/checkout-idempotency.integration-spec.ts` | TBD |
| Stage 7: inventory locking | `test/inventory-locking.integration-spec.ts` | TBD |
| Stage 7: cart concurrency | `test/cart-concurrency.integration-spec.ts` | TBD |
| Stage 7: cart cleanup | `test/cart-cleanup.integration-spec.ts` | TBD |
| Stage 7: addresses | `test/addresses.integration-spec.ts` | TBD |
| Stage 7: migrations | `test/transactional-shopping-migration.integration-spec.ts` | TBD |
| Stage 7: unpaid-order reaper and cancel race | `test/checkout-reaper.integration-spec.ts` | TBD |
| Repeat runs | Stage 7 specs rerun | TBD |
| Build | `npm run build` | TBD |

The Stage 7 specs cover:

- [checkout-reaper](../../services/commerce-api/test/checkout-reaper.integration-spec.ts):
  - the reaper job is enqueued at the reservation TTL plus 60 s;
  - a stranded keyed order is cancelled, stock is restored, the key replays `CHECKOUT_EXPIRED` byte for byte, and the cart is kept;
  - it retries while a lease is live, then cancels once the lease lapses;
  - it does nothing for a paid, cancelled or payment-holding order;
  - cancellation against a concurrent Payment insert answers 409, then succeeds on retry;
  - the reaper and a Payment insert race without deadlock.

- [checkout-idempotency](../../services/commerce-api/test/checkout-idempotency.integration-spec.ts):
  - one owner among simultaneous requests, then byte-identical replays;
  - recorded refusals and declines;
  - `CHECKOUT_KEY_REUSED`, per-user scoping and keyless double submits;
  - no payment details or snapshot in receipts;
  - legacy orders, draft attempts and retired keys;
  - crash boundaries before the order commits, before the payment row, after provider acceptance and with an unknown outcome;
  - expired resumption, and stale owners that cannot create or charge;
  - `BLOCKED` with a failed payment.
- [inventory-locking](../../services/commerce-api/test/inventory-locking.integration-spec.ts):
  - in-transaction sweep with two lines on one variant;
  - expiry, cancel and confirm against checkout in both arrival orders;
  - reversed line orders across two records, with no deadlock and no oversell;
  - N concurrent checkouts on the last units;
  - idempotent release and commit;
  - a record created after the pool lock.
- [cart-concurrency](../../services/commerce-api/test/cart-concurrency.integration-spec.ts):
  - first-cart creation;
  - concurrent adds, the stock limit, the 409 details and int4 overflow;
  - decreases above stock;
  - single-consumption and all-or-nothing merges;
  - first-fit parity with checkout;
  - checkout revalidation.
- [cart-cleanup](../../services/commerce-api/test/cart-cleanup.integration-spec.ts):
  - partial checkout;
  - retry, then cleanup;
  - kept later edits and re-adds, and idempotency;
  - declines and refusals preserve the cart;
  - an unresolved payment;
  - inline and enqueue failures, including the rollback of the order transaction;
  - legacy payloads;
  - a cancelled order without a payment.
- [addresses](../../services/commerce-api/test/addresses.integration-spec.ts): concurrent first creates, `setDefault` races, deleting the default against create or promote, ownership inside the lock, the partial unique index and legacy zero-default repair.
- [transactional-shopping-migration](../../services/commerce-api/test/transactional-shopping-migration.integration-spec.ts): a fresh database; an upgrade of representative data without deleting or rewriting rows; and the failure, preflight and forward-repair path for each invalid-data case. Each scenario creates and drops its own `stage7_*_test` scratch database.

Stage 7 unit specs include:

- `checkout-attempts.service.spec.ts`
- `checkout-fingerprint.spec.ts`
- `stock-allocation.spec.ts`
- `cart.service.mutations.spec.ts`
- `addresses.service.invariant.spec.ts`
- the keyring cases in `env.validation.spec.ts`

**Finding during verification.** A Stage 7 integration database had already received the committed draft migration. On it, the follow-up migration's preflight stopped on orphaned draft-era `checkout_attempts` rows that earlier test cleanup had left behind; the draft had no foreign key to prevent them. The migration raised with the offending IDs and rewrote nothing. The disposable database was recreated rather than repaired.
