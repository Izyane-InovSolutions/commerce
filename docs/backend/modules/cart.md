# Cart

> Persistent shopping cart for signed-in users and guests (opaque `x-guest-token`), priced and availability-checked on every read, merged into the user's cart after login, and cleaned up after checkout (inline or through a retry job).

## Purpose and features

- **Guests** add, update and remove lines without an account; the first add creates a guest cart and returns its token in the `x-guest-token` response header and in the body.
- **Signed-in users** have one active cart keyed by `userId`; after login they merge a guest cart into it.
- **Every read** re-prices lines in the requested currency and flags unavailable lines (unpublished, seller not approved, no current price, not enough stock) without removing them.
- **Checkout/orders** reuse the cart view (`getCartView`), the single-offer preview (`previewOfferLine`, for buy-now) and the cleanup calls (`removeItems`, `clearCart`).

## Routes

Conventions (prefix, guards, envelope): see [../architecture.md](../architecture.md), [../auth-and-access.md](../auth-and-access.md). `@OptionalAuth()` means a missing bearer token proceeds as a guest; a present but invalid one still gets 401 ([optional-auth.decorator.ts](../../../services/commerce-api/src/common/auth/optional-auth.decorator.ts)). When a user is authenticated, the guest token is ignored ([cart.controller.ts:114](../../../services/commerce-api/src/modules/cart/cart.controller.ts#L114)).

| Method | Path                       | Access                                    | Idempotency                                  | Description                                                                                                                                                                                  |
| ------ | -------------------------- | ----------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/v1/cart               | `@OptionalAuth` (user or `x-guest-token`) | n/a                                          | Cart view; empty view with `id: null` if no cart, none created ([cart.controller.ts:35](../../../services/commerce-api/src/modules/cart/cart.controller.ts#L35))                             |
| POST   | /api/v1/cart/items         | `@OptionalAuth`                           | None (adds increment)                        | Add `{offerId, quantity>=1}`; creates the cart if needed; new guest token in header + body ([cart.controller.ts:48](../../../services/commerce-api/src/modules/cart/cart.controller.ts#L48)) |
| PATCH  | /api/v1/cart/items/:itemId | `@OptionalAuth`                           | Absolute set (naturally idempotent)          | Set quantity >= 1 ([cart.controller.ts:71](../../../services/commerce-api/src/modules/cart/cart.controller.ts#L71))                                                                          |
| DELETE | /api/v1/cart/items/:itemId | `@OptionalAuth`                           | Second call -> 404                           | Remove a line ([cart.controller.ts:88](../../../services/commerce-api/src/modules/cart/cart.controller.ts#L88))                                                                              |
| POST   | /api/v1/cart/merge         | Authenticated + `x-guest-token`           | Guest cart becomes MERGED; replay is a no-op | Merge guest lines into the user cart; 200 ([cart.controller.ts:104](../../../services/commerce-api/src/modules/cart/cart.controller.ts#L104))                                                |

Every route takes `?currency=` (`CurrencyQueryDto`, only `ZMW`, default `ZMW`) ([currency-query.dto.ts](../../../services/commerce-api/src/common/catalog/dto/currency-query.dto.ts)). DTOs: `AddItemDto` `offerId` UUID + `quantity` int >= 1 ([add-item.dto.ts:3](../../../services/commerce-api/src/modules/cart/dto/add-item.dto.ts#L3)); `UpdateItemDto` `quantity` int >= 1 ([update-item.dto.ts:3](../../../services/commerce-api/src/modules/cart/dto/update-item.dto.ts#L3)).

## Services

| Service                                                                                                                        | Responsibility                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `CartService` ([cart.service.ts](../../../services/commerce-api/src/modules/cart/cart.service.ts))                             | `getCartView`, `addItem`, `updateItemQuantity`, `removeItem`, `previewOfferLine`, `clearCart`, `removeItems`, `mergeGuestCart`. Exported. |
| `CartCleanupHandler` ([cart-cleanup.handler.ts](../../../services/commerce-api/src/modules/cart/jobs/cart-cleanup.handler.ts)) | `cart.cleanup_items` job. Exported for `WorkersModule`.                                                                                   |
| `generateGuestToken` ([guest-token.util.ts:6](../../../services/commerce-api/src/modules/cart/guest-token.util.ts#L6))         | 24 random bytes, base64url. Stored in plain text: treated as a cart-id cookie, not a credential.                                          |

## Business rules

**Cart identity**

- A cart has exactly one of `userId` (unique) or `guestToken` (unique), and `status` `ACTIVE | MERGED`.
- Lookup always filters `status = ACTIVE`, so a merged guest token stops resolving even though the token is kept ([cart.service.ts:256](../../../services/commerce-api/src/modules/cart/cart.service.ts#L256)). No identity -> no cart.
- Carts are created lazily on the first add only ([cart.service.ts:235](../../../services/commerce-api/src/modules/cart/cart.service.ts#L235)); a guest add without a token always creates a new guest cart.

**Mutations**

- Add ([cart.service.ts:54](../../../services/commerce-api/src/modules/cart/cart.service.ts#L54)): quantity > 0; offer must exist with `status = PUBLISHED` (400 "This offer is not available"); a marketplace offer's seller must be `APPROVED` (400). Stock and price are **not** checked at add time. Upsert on `(cartId, offerId)`: an existing line's quantity is incremented.
- Update/remove ([cart.service.ts:89](../../../services/commerce-api/src/modules/cart/cart.service.ts#L89), [:112](../../../services/commerce-api/src/modules/cart/cart.service.ts#L112)): cart must resolve (404 `Cart not found`), and the item must belong to it (404 `Cart item not found`) ([:286](../../../services/commerce-api/src/modules/cart/cart.service.ts#L286)). Quantity 0 is rejected; use DELETE.
- `clearCart` / `removeItems` are silent no-ops when no cart resolves ([cart.service.ts:163](../../../services/commerce-api/src/modules/cart/cart.service.ts#L163)).

**Merge** ([cart.service.ts:191](../../../services/commerce-api/src/modules/cart/cart.service.ts#L191))

- No token, unknown token or non-ACTIVE guest cart -> returns the user's cart view unchanged.
- Otherwise gets or creates the user cart, then in one transaction upserts every guest line into it (quantities add up for the same offer) and marks the guest cart `MERGED`.

**Pricing and availability** ([cart.service.ts:344](../../../services/commerce-api/src/modules/cart/cart.service.ts#L344))

- Price: `pickCurrentPrice(offer.prices, currency)`. Stock: `getAvailableOfferQuantities` for `stockSource = SELLER`, otherwise `getAvailableQuantities(variantId)`, batched per view ([:315](../../../services/commerce-api/src/modules/cart/cart.service.ts#L315)).
- `isAvailable` = offer exists, seller (if any) `APPROVED`, `PUBLISHED`, has a current price, and available quantity >= line quantity ([:362](../../../services/commerce-api/src/modules/cart/cart.service.ts#L362)).
- `lineTotal` is 0 for unavailable lines; `subtotal` sums available lines only ([:330](../../../services/commerce-api/src/modules/cart/cart.service.ts#L330)). The view's `currency` is always the requested one. `currencies` lists every currency the offer currently has a price in.
- `previewOfferLine` builds the same line view for an offer with id `buy-now:<offerId>`, without touching any cart ([cart.service.ts:133](../../../services/commerce-api/src/modules/cart/cart.service.ts#L133)).

## Data

| Model                            | Access                                           |
| -------------------------------- | ------------------------------------------------ |
| `Cart`                           | create, update (`status = MERGED`), read         |
| `CartItem`                       | upsert, update, delete, deleteMany, read         |
| `Offer`, `Price`, `Seller`       | read via `OfferReadService`                      |
| `InventoryRecord` / reservations | read via `InventoryService` availability queries |

## Dependencies

- Imports `OffersModule` (`OfferReadService`) and `InventoryModule` ([cart.module.ts:10](../../../services/commerce-api/src/modules/cart/cart.module.ts#L10)).
- Guest token header and decorator: [guest-token.decorator.ts](../../../services/commerce-api/src/common/auth/guest-token.decorator.ts) (`x-guest-token`; empty string = absent).
- Callers: orders (`getCartView`, `previewOfferLine`), checkout (`removeItems`, `clearCart`), `WorkersModule` (handler).

## Jobs and events

- **`cart.cleanup_items`** ([cart-cleanup.handler.ts:7](../../../services/commerce-api/src/modules/cart/jobs/cart-cleanup.handler.ts#L7)): enqueued by checkout when the post-payment cart write fails ([checkout.service.ts:106](../../../services/commerce-api/src/modules/checkout/checkout.service.ts#L106)). Payload `{userId, itemIds?}`; non-empty `itemIds` -> `removeItems`, otherwise `clearCart`. A payload without a string `userId`, or `itemIds` that is not a string array, throws and dead-letters after the default attempts ([:36](../../../services/commerce-api/src/modules/cart/jobs/cart-cleanup.handler.ts#L36)). See [../background-processing.md](../background-processing.md).
- No outbox topics.

## Configuration

None.

## Tests

- [cart.service.spec.ts](../../../services/commerce-api/src/modules/cart/cart.service.spec.ts): add (seller stock, suspended seller, non-positive quantity, unpublished, guest cart + token, increment), view (no cart, insufficient stock, no price, subtotal of available lines, seller-scoped inventory, suspended seller), `previewOfferLine`, update/remove not-found and foreign item, merge (no token, upsert + MERGED, inactive token), `clearCart`, `removeItems`.
- [cart-cleanup.handler.spec.ts](../../../services/commerce-api/src/modules/cart/jobs/cart-cleanup.handler.spec.ts): job type, clear vs remove, malformed payloads.
- [cart.e2e-spec.ts](../../../services/commerce-api/test/cart.e2e-spec.ts): anonymous use allowed but merge needs auth, guest cart merged after login, unpublished offer rejected.

## Known gaps

- Merge is not concurrency-safe: the guest cart is read and its `ACTIVE` status checked outside the transaction, and the `MERGED` update is not conditional, so two concurrent merges can both add the guest quantities ([cart.service.ts:200](../../../services/commerce-api/src/modules/cart/cart.service.ts#L200), [:226](../../../services/commerce-api/src/modules/cart/cart.service.ts#L226)).
- Lazy creation races: two concurrent first adds for a user both try `cart.create`, and the unique `userId` makes the loser fail with an unmapped P2002 ([cart.service.ts:245](../../../services/commerce-api/src/modules/cart/cart.service.ts#L245)). Two guest adds without a token create two carts.
- The cleanup job with empty `itemIds` clears the **whole** cart at run time, including lines the user added after checkout ([cart-cleanup.handler.ts:29](../../../services/commerce-api/src/modules/cart/jobs/cart-cleanup.handler.ts#L29)).
- No upper bound on line quantity at add, update or merge; increments can grow a line past available stock (the line is then only flagged unavailable).
- Guest and merged carts are never expired or deleted; there is no TTL or sweeper.
- The guest token is returned in both a header and the body and is stored unhashed (by design, [guest-token.util.ts:3](../../../services/commerce-api/src/modules/cart/guest-token.util.ts#L3)); anyone holding it can read and edit that cart until it is merged.
- `CartView` assumes one currency; only `ZMW` is supported today ([cart.types.ts:18](../../../services/commerce-api/src/modules/cart/cart.types.ts#L18)).
