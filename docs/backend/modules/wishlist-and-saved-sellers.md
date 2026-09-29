# Wishlist and saved sellers

> Two small per-user bookmark lists: offers on a wishlist (priced and availability-checked on read) and saved sellers (storefront card with rating aggregate). Both are idempotent add/remove sets keyed by a unique `(userId, target)` pair.

## Purpose and features

**Wishlist** (`src/modules/wishlist`)

- Signed-in users bookmark offers, list them with the current price in the requested currency and an `isAvailable` flag, and remove them.
- Adding an offer that is already there, or removing one that is not, succeeds silently.

**Saved sellers** (`src/modules/saved-sellers`)

- Signed-in users save sellers, list them as storefront cards (slug, display name, description, average rating, rating count, `isAvailable`), and unsave them.
- Same idempotent add/remove semantics.

## Routes

Conventions (prefix, guards, envelope): see [../architecture.md](../architecture.md), [../auth-and-access.md](../auth-and-access.md). No route has `@Public`, `@Roles` or `@RequireVerifiedEmail`, so each one only needs a valid session.

| Method | Path                            | Access        | Idempotency                                            | Description                                                                                                                                                               |
| ------ | ------------------------------- | ------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/v1/wishlist                | Authenticated | n/a                                                    | Own wishlist, newest first, `?currency=` (ZMW), unpaginated ([wishlist.controller.ts:25](../../../services/commerce-api/src/modules/wishlist/wishlist.controller.ts#L25)) |
| POST   | /api/v1/wishlist                | Authenticated | Natural: unique `(userId, offerId)`, duplicate = no-op | Add `{offerId}`; 204 ([wishlist.controller.ts:33](../../../services/commerce-api/src/modules/wishlist/wishlist.controller.ts#L33))                                        |
| DELETE | /api/v1/wishlist/:offerId       | Authenticated | Natural (`deleteMany`)                                 | Remove by offer id; 204 even if absent ([wishlist.controller.ts:42](../../../services/commerce-api/src/modules/wishlist/wishlist.controller.ts#L42))                      |
| GET    | /api/v1/saved-sellers           | Authenticated | n/a                                                    | Own saved sellers, newest first, unpaginated ([saved-sellers.controller.ts:23](../../../services/commerce-api/src/modules/saved-sellers/saved-sellers.controller.ts#L23)) |
| POST   | /api/v1/saved-sellers           | Authenticated | Natural: unique `(userId, sellerId)`                   | Save `{sellerId}`; 204 ([saved-sellers.controller.ts:28](../../../services/commerce-api/src/modules/saved-sellers/saved-sellers.controller.ts#L28))                       |
| DELETE | /api/v1/saved-sellers/:sellerId | Authenticated | Natural (`deleteMany`)                                 | Unsave; 204 even if absent ([saved-sellers.controller.ts:37](../../../services/commerce-api/src/modules/saved-sellers/saved-sellers.controller.ts#L37))                   |

DTOs: `AddWishlistItemDto.offerId` and `SaveSellerDto.sellerId` are `@IsUUID()` ([add-wishlist-item.dto.ts:3](../../../services/commerce-api/src/modules/wishlist/dto/add-wishlist-item.dto.ts#L3), [save-seller.dto.ts:3](../../../services/commerce-api/src/modules/saved-sellers/dto/save-seller.dto.ts#L3)). Path params use `ParseUUIDPipe`.

## Services

| Service                                                                                                                               | Responsibility                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `WishlistService` ([wishlist.service.ts](../../../services/commerce-api/src/modules/wishlist/wishlist.service.ts))                    | `list`, `add`, `remove`. Exported, but no other module uses it. |
| `SavedSellersService` ([saved-sellers.service.ts](../../../services/commerce-api/src/modules/saved-sellers/saved-sellers.service.ts)) | `list`, `add`, `remove`. Exported, but no other module uses it. |

## Business rules

**Wishlist**

- Add ([wishlist.service.ts:65](../../../services/commerce-api/src/modules/wishlist/wishlist.service.ts#L65)): the offer must exist (`OfferReadService.find`, no status filter), else 400 "This offer does not exist". A P2002 on the unique pair is swallowed ([:74](../../../services/commerce-api/src/modules/wishlist/wishlist.service.ts#L74)).
- Remove: `deleteMany({userId, offerId})`, so it never fails ([wishlist.service.ts:82](../../../services/commerce-api/src/modules/wishlist/wishlist.service.ts#L82)).
- List ([wishlist.service.ts:18](../../../services/commerce-api/src/modules/wishlist/wishlist.service.ts#L18)): rows ordered `createdAt desc`; offers batch-loaded; stock from `getAvailableOfferQuantities` for `stockSource = SELLER`, otherwise `getAvailableQuantities(variantId)`, both in parallel.
- `currentPrice` = `pickCurrentPrice(offer.prices, currency)` or null. `isAvailable` = offer exists, seller (if any) `APPROVED`, `PUBLISHED`, has a current price and available quantity **> 0** ([wishlist.service.ts:55](../../../services/commerce-api/src/modules/wishlist/wishlist.service.ts#L55)). Compare cart, which needs quantity >= the line quantity.
- The view is minimal: `{id, offerId, currentPrice, isAvailable}` ([wishlist.types.ts:1](../../../services/commerce-api/src/modules/wishlist/wishlist.types.ts#L1)); clients fetch offer details separately.

**Saved sellers**

- Add ([saved-sellers.service.ts:43](../../../services/commerce-api/src/modules/saved-sellers/saved-sellers.service.ts#L43)): the seller row must exist (any status), else 400 "This seller does not exist"; duplicate P2002 swallowed.
- Remove: `deleteMany({userId, sellerId})` ([saved-sellers.service.ts:62](../../../services/commerce-api/src/modules/saved-sellers/saved-sellers.service.ts#L62)).
- List ([saved-sellers.service.ts:12](../../../services/commerce-api/src/modules/saved-sellers/saved-sellers.service.ts#L12)): ordered `createdAt desc`, with seller `storefrontSlug`, `displayName`, `description`, `status`, `ratingSummary`. `averageRating` = `ratingSum / ratingCount` from the persisted `SellerRatingSummary`, null when unrated ([rating-summary.util.ts:25](../../../services/commerce-api/src/modules/reviews/rating-summary.util.ts#L25)); `ratingCount` defaults to 0.
- `isAvailable` = seller `APPROVED` and has a `storefrontSlug` ([saved-sellers.service.ts:37](../../../services/commerce-api/src/modules/saved-sellers/saved-sellers.service.ts#L37)). Rows for unavailable sellers are still returned.

## Data

| Model                           | Access                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `WishlistItem`                  | create, deleteMany, read (unique `userId, offerId`; cascades on user/offer delete)   |
| `SavedSeller`                   | create, deleteMany, read (unique `userId, sellerId`; cascades on user/seller delete) |
| `Offer`, `Price`, `Seller`      | read via `OfferReadService` (wishlist)                                               |
| `Seller`, `SellerRatingSummary` | read directly (saved sellers)                                                        |
| Inventory availability          | read via `InventoryService` (wishlist)                                               |

## Dependencies

- Wishlist imports `OffersModule` and `InventoryModule` ([wishlist.module.ts:9](../../../services/commerce-api/src/modules/wishlist/wishlist.module.ts#L9)).
- Saved sellers imports no modules; it reads Prisma directly and uses the `averageRatingFromSummary` helper from `../reviews` ([saved-sellers.service.ts:5](../../../services/commerce-api/src/modules/saved-sellers/saved-sellers.service.ts#L5)).

## Jobs and events

None. No outbox topics or background jobs.

## Configuration

None.

## Tests

- [wishlist.service.spec.ts](../../../services/commerce-api/src/modules/wishlist/wishlist.service.spec.ts): missing offer, duplicate add no-op, create, idempotent remove, unavailable when out of stock or unpriced.
- [saved-sellers.service.spec.ts](../../../services/commerce-api/src/modules/saved-sellers/saved-sellers.service.spec.ts): missing seller, duplicate save no-op, create, idempotent remove, unavailable when suspended or without storefront.
- No controller or e2e tests (only fake-Prisma support in `test/support/fake-prisma.service.ts`).

## Known gaps

- Saved sellers accepts sellers in any status (PENDING, REJECTED, SUSPENDED) and then lists their `displayName` and `description`. Together with the 400 on unknown ids, this lets any user probe for and read unapproved seller profiles ([saved-sellers.service.ts:44](../../../services/commerce-api/src/modules/saved-sellers/saved-sellers.service.ts#L44), [:33](../../../services/commerce-api/src/modules/saved-sellers/saved-sellers.service.ts#L33)).
- Wishlist add accepts unpublished or draft offers (no status filter in `OfferReadService.find`), and the 400 vs 204 response reveals whether an offer id exists ([wishlist.service.ts:66](../../../services/commerce-api/src/modules/wishlist/wishlist.service.ts#L66)).
- Both lists are unpaginated and have no size cap.
- Wishlist "available" (qty > 0) and cart "available" (qty >= line quantity) use different rules.
- `isUniqueConstraintError` is duplicated in both services instead of using a shared helper.
