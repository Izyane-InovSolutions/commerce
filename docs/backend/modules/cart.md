# Cart

> Persistent shopping cart for signed-in users and guests (opaque `x-guest-token`). Lines are priced and availability-checked on every read. Adds, increases and merges that exceed available stock are refused. A guest cart merges into the user's cart after login. After checkout, only the lines still exactly as checked out are removed.

## Purpose and features

- **Guests** add, update and remove lines without an account; the first add creates a guest cart and returns its token in the `x-guest-token` response header and in the body.
- **Signed-in users** have one active cart keyed by `userId`; after login they merge a guest cart into it.
- **Every read** re-prices lines in the requested currency and flags unavailable lines (unpublished, seller not approved, no current price, not enough stock) without removing them.
- **Every add, increase or merge** is checked against the stock checkout could reserve, and rejected with 409 when it does not fit. The cart never reserves stock.
- **Checkout/orders** reuse:
  - the cart view (`getCartView`);
  - the single-offer preview (`previewOfferLine`, for buy-now);
  - the checkout snapshot calls (`getCheckoutSnapshot`, `lockAndVerifyCheckoutSnapshot`);
  - the post-payment cleanup (`cleanUpCheckout`).

## Routes

Conventions (prefix, guards, envelope): see [../architecture.md](../architecture.md), [../auth-and-access.md](../auth-and-access.md). `@OptionalAuth()` means a missing bearer token proceeds as a guest; a present but invalid one still gets 401 ([optional-auth.decorator.ts](../../../services/commerce-api/src/common/auth/optional-auth.decorator.ts)). When a user is authenticated, the guest token is ignored ([cart.controller.ts:138](../../../services/commerce-api/src/modules/cart/cart.controller.ts#L138)).

| Method | Path | Access | Idempotency | Description |
| --- | --- | --- | --- | --- |
| GET | /api/v1/cart | `@OptionalAuth` (user or `x-guest-token`) | n/a | Cart view; empty view with `id: null` if no cart, none created ([cart.controller.ts:37](../../../services/commerce-api/src/modules/cart/cart.controller.ts#L37)) |
| POST | /api/v1/cart/items | `@OptionalAuth` | None (adds increment) | Add `{offerId, quantity>=1}`; creates the cart if needed; new guest token in header + body; 409 on shortage or overflow ([cart.controller.ts:50](../../../services/commerce-api/src/modules/cart/cart.controller.ts#L50)) |
| PATCH | /api/v1/cart/items/:itemId | `@OptionalAuth` | Absolute set (naturally idempotent) | Set quantity >= 1; an increase is stock-checked ([cart.controller.ts:78](../../../services/commerce-api/src/modules/cart/cart.controller.ts#L78)) |
| DELETE | /api/v1/cart/items/:itemId | `@OptionalAuth` | Second call -> 404 | Remove a line ([cart.controller.ts:100](../../../services/commerce-api/src/modules/cart/cart.controller.ts#L100)) |
| POST | /api/v1/cart/merge | Authenticated + `x-guest-token` | Guest cart consumed once; replay is a no-op | Merge guest lines into the user cart, all or nothing; 200 ([cart.controller.ts:119](../../../services/commerce-api/src/modules/cart/cart.controller.ts#L119)) |

Every route takes `?currency=` (`CurrencyQueryDto`, only `ZMW`, default `ZMW`) ([currency-query.dto.ts](../../../services/commerce-api/src/common/catalog/dto/currency-query.dto.ts)). DTOs: `AddItemDto` `offerId` UUID + `quantity` int >= 1 ([add-item.dto.ts:3](../../../services/commerce-api/src/modules/cart/dto/add-item.dto.ts#L3)); `UpdateItemDto` `quantity` int >= 1 ([update-item.dto.ts:3](../../../services/commerce-api/src/modules/cart/dto/update-item.dto.ts#L3)).

**409 responses**

| Message | When | `details` |
| --- | --- | --- |
| `Requested quantity exceeds available stock` | An add, increase or merge leaves a stock pool wanting more than checkout could allocate | `{field: 'offerId', message: <offer id>}`, `{field: 'available', message: <pool total, as a string>}` |
| `Cart quantity is too large` | A resulting line quantity exceeds 2,147,483,647 (PostgreSQL `integer`) | none |
| `Cart is no longer active` | The cart stopped being `ACTIVE` before the mutation took its lock | none |

## Services

| Service | Responsibility |
| --- | --- |
| `CartService` ([cart.service.ts](../../../services/commerce-api/src/modules/cart/cart.service.ts)) | `getCartView`, `addItem`, `updateItemQuantity`, `removeItem`, `previewOfferLine`, `clearCart`, `removeItems`, `mergeGuestCart`, `getCheckoutSnapshot`, `lockAndVerifyCheckoutSnapshot`, `cleanUpCheckout`. Exported. |
| `CartCleanupHandler` ([cart-cleanup.handler.ts](../../../services/commerce-api/src/modules/cart/jobs/cart-cleanup.handler.ts)) | `cart.cleanup_items` job; exports `CART_CLEANUP_JOB_TYPE`. Exported for `WorkersModule`. |
| `generateGuestToken` ([guest-token.util.ts:6](../../../services/commerce-api/src/modules/cart/guest-token.util.ts#L6)) | 24 random bytes, base64url. Stored in plain text: treated as a cart-id cookie, not a credential. |

## Business rules

**Cart identity**

- A cart has exactly one of `userId` (unique) or `guestToken` (unique), and `status` `ACTIVE | MERGED`.
- Lookup always filters `status = ACTIVE`, so a merged guest token stops resolving even though the token is kept ([cart.service.ts:644](../../../services/commerce-api/src/modules/cart/cart.service.ts#L644)). No identity -> no cart.
- Carts are created lazily on the first add only. A user's cart is created under a `users` row lock, so concurrent first adds create exactly one cart; a P2002 on the unique `userId` re-reads the winner ([cart.service.ts:624](../../../services/commerce-api/src/modules/cart/cart.service.ts#L624)). A guest add without a token always creates a new guest cart.

**Mutations** (one transaction each, holding the cart row lock; [cart.service.ts:485](../../../services/commerce-api/src/modules/cart/cart.service.ts#L485))

- Every mutation (add, set quantity, remove, `clearCart`, `removeItems`, merge, cleanup) locks its cart row(s) `FOR UPDATE` and re-reads the status and quantities under the lock. Add, set quantity and remove fail with 409 `Cart is no longer active` once the cart is not `ACTIVE`. `clearCart` / `removeItems` are silent no-ops when no cart resolves or it is no longer active.
- Add ([cart.service.ts:71](../../../services/commerce-api/src/modules/cart/cart.service.ts#L71)):
  - Quantity must be > 0.
  - The offer must exist with `status = PUBLISHED` (400 "This offer is not available"), and a marketplace offer's seller must be `APPROVED` (400).
  - It upserts on `(cartId, offerId)`: an existing line's quantity is incremented and its `revision` bumped.
- Update ([cart.service.ts:115](../../../services/commerce-api/src/modules/cart/cart.service.ts#L115)): the cart must resolve (404 `Cart not found`) and the item must belong to it (404 `Cart item not found`). Quantity 0 is rejected; use DELETE. The `revision` moves on every update, even to the same quantity.
- Remove ([cart.service.ts:149](../../../services/commerce-api/src/modules/cart/cart.service.ts#L149)): 404 when the line is not in the cart.
- `revision` is the line's version. A checkout snapshot taken before any later write no longer matches the line, so checkout cannot use stale lines and cleanup cannot delete newer ones.

**Stock check** ([cart.service.ts:538](../../../services/commerce-api/src/modules/cart/cart.service.ts#L538))

- Runs inside the mutation transaction after its writes, so a shortage rolls the whole mutation back.
- It builds the cart's resulting lines and groups them by stock pool: a `SELLER`-stock offer uses its own record, any other offer uses its variant's platform records. Only pools whose demand increased in this mutation are checked; decreases and removals always go through, even on a cart that is already short.
- Allocatable stock per record is `onHand - reserved` plus lapsed `ACTIVE` reservations, which checkout would sweep ([inventory.md](inventory.md#business-rules)). It is read **without locks**: a cart never reserves stock, and checkout re-checks authoritatively.
- Demands are allocated the way checkout reserves: each line whole to the first record (ascending id) that can hold it, in cart-line `(createdAt, id)` order, never split. A pool whose total is large enough can therefore still refuse a line no single record can hold.
- Any resulting quantity above the `integer` range is refused before the stock check.

**Merge** ([cart.service.ts:243](../../../services/commerce-api/src/modules/cart/cart.service.ts#L243))

- No token, unknown token or a non-ACTIVE guest cart -> returns the user's cart view unchanged.
- Otherwise it gets or creates the user cart, then in one transaction locks both carts in ascending id and re-reads both.
  - A guest cart that a concurrent merge already consumed makes this merge a no-op, so a guest cart is consumed exactly once.
  - Otherwise every guest line is upserted into the user cart (quantities add up, revisions bump), and the guest cart is marked `MERGED`.
- The merge is all or nothing: a shortage or overflow on any line rolls everything back with 409, and the guest cart stays mergeable.

**Checkout snapshot** ([cart.service.ts:329](../../../services/commerce-api/src/modules/cart/cart.service.ts#L329), [:357](../../../services/commerce-api/src/modules/cart/cart.service.ts#L357))

- `getCheckoutSnapshot` returns `{id, offerId, quantity, revision, createdAt}` for the selected lines of the user's active cart, in `(createdAt, id)` order. Orders persists `{id, offerId, quantity, revision}` as the order's internal `checkoutCartSnapshot`.
- `lockAndVerifyCheckoutSnapshot` runs inside the order transaction. It locks the cart row and rejects any missing or changed line (id, offer, quantity or revision) with 409 `Cart changed; review your cart and check out again`. The lock is held until the order commits.

**Pricing and availability** ([cart.service.ts:674](../../../services/commerce-api/src/modules/cart/cart.service.ts#L674))

- Price: `pickCurrentPrice(offer.prices, currency)`. Stock: `getAvailableOfferQuantities` for `stockSource = SELLER`, otherwise `getAvailableQuantities(variantId)`, batched per view.
- `isAvailable` = offer exists, seller (if any) `APPROVED`, `PUBLISHED`, has a current price, and available quantity >= line quantity ([:735](../../../services/commerce-api/src/modules/cart/cart.service.ts#L735)). A line can still turn unavailable after it was accepted, when stock falls.
- `lineTotal` is 0 for unavailable lines; `subtotal` sums available lines only. The view's `currency` is always the requested one. `currencies` lists every currency the offer currently has a price in.
- `previewOfferLine` builds the same line view for an offer with id `buy-now:<offerId>`, without touching any cart ([cart.service.ts:173](../../../services/commerce-api/src/modules/cart/cart.service.ts#L173)).

## Data

| Model | Access |
| --- | --- |
| `Cart` | create, update (`status = MERGED`), read, row lock |
| `CartItem` | upsert, update (`quantity`, `revision`), delete, deleteMany, read |
| `Order` | read `status`, `checkoutCartSnapshot` and payment status for cleanup |
| `User` | row lock when creating a user's cart |
| `Offer`, `Price`, `Seller` | read via `OfferReadService` |
| `InventoryRecord` / reservations | read via `InventoryService` (`getAllocatableStock` and availability queries) |

## Dependencies

- Imports `OffersModule` (`OfferReadService`) and `InventoryModule` ([cart.module.ts](../../../services/commerce-api/src/modules/cart/cart.module.ts)).
- Guest token header and decorator: [guest-token.decorator.ts](../../../services/commerce-api/src/common/auth/guest-token.decorator.ts) (`x-guest-token`; empty string = absent).
- Callers: orders (`getCartView`, `previewOfferLine`, the snapshot calls, `CART_CLEANUP_JOB_TYPE`), checkout (`cleanUpCheckout`) and `WorkersModule` (handler).

## Jobs and events

- **`cart.cleanup_items`** ([cart-cleanup.handler.ts](../../../services/commerce-api/src/modules/cart/jobs/cart-cleanup.handler.ts)): payload `{userId, orderId}`, enqueued by orders inside the order transaction at +60 s with `maxAttempts` 20, and again by `confirmPayment`. The handler calls `cleanUpCheckout(userId, orderId)` ([cart.service.ts:400](../../../services/commerce-api/src/modules/cart/cart.service.ts#L400)), which is idempotent:
  - Missing order (user deleted) -> done.
  - No payment row: order still `PENDING_PAYMENT` -> throw and retry; otherwise (for example cancelled) -> done, cart kept.
  - Payment `FAILED`/`CANCELLED` -> done, cart kept.
  - Payment without a provider reference and not `SUCCEEDED` -> throw and retry (awaits reconciliation).
  - Snapshot not an array (orders from before receipts) -> done, nothing deleted. Draft-era entries without `offerId` still match.
  - Otherwise, under the cart lock, it deletes only lines that still match a snapshot entry by id, quantity and revision.
- Legacy payloads without `orderId` (the old `{userId, itemIds?}` shape) complete without deleting anything. A payload without a string `userId`, a non-string `orderId` or a non-string-array `itemIds` throws and dead-letters.
- After 20 failed attempts the job dead-letters and the cart is preserved. See [../background-processing.md](../background-processing.md).
- No outbox topics.

## Configuration

None.

## Tests

- [cart.service.spec.ts](../../../services/commerce-api/src/modules/cart/cart.service.spec.ts), [cart.service.mutations.spec.ts](../../../services/commerce-api/src/modules/cart/cart.service.mutations.spec.ts): add and view rules, stock check and 409 details, overflow, revisions, locking, merge rollback, snapshot verification and cleanup decisions.
- [cart-cleanup.handler.spec.ts](../../../services/commerce-api/src/modules/cart/jobs/cart-cleanup.handler.spec.ts): job type, `orderId` payloads, legacy payloads delete nothing, malformed payloads.
- [test/cart-concurrency.integration-spec.ts](../../../services/commerce-api/test/cart-concurrency.integration-spec.ts) and [test/cart-cleanup.integration-spec.ts](../../../services/commerce-api/test/cart-cleanup.integration-spec.ts) (real PostgreSQL): races on creation, adds and merges; stock limits; first-fit parity with checkout; checkout revalidation; cleanup of only checked-out line versions. Results: [Stage 7 verification](../transactional-shopping-verification.md#verification).
- [cart.e2e-spec.ts](../../../services/commerce-api/test/cart.e2e-spec.ts): anonymous use allowed but merge needs auth, guest cart merged after login, unpublished offer rejected.

## Known gaps

- Cart contents never reserve stock, and the stock check reads without locks. A cart accepted moments ago can still be refused at checkout, which is authoritative.
- After the gateway accepted a payment, cleanup removes the checked-out lines even if that payment later fails.
- A cleanup that keeps failing (for example a payment initialization with an unknown outcome and no provider reference) dead-letters after 20 attempts and leaves the lines in the cart.
- Two guest adds without a token create two guest carts.
- Guest and merged carts are never expired or deleted; there is no TTL or sweeper.
- The guest token is returned in both a header and the body and is stored unhashed (by design, [guest-token.util.ts:3](../../../services/commerce-api/src/modules/cart/guest-token.util.ts#L3)); anyone holding it can read and edit that cart until it is merged.
- `CartView` assumes one currency; only `ZMW` is supported today ([cart.types.ts:18](../../../services/commerce-api/src/modules/cart/cart.types.ts#L18)).
- The 409 descriptions declared with `@ApiResponse` on the cart controller do not appear in the served OpenAPI document: `createApiDocument` replaces each operation's `responses` with the generated contract.
