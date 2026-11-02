# Checkout

> Orchestration over orders, payments and cart: create an order from the cart (whole or partial) or from one offer, start its payment, and clean up the cart. An optional Idempotency-Key runs the request under a fingerprinted, leased checkout attempt that replays, refuses or resumes retries. Also exposes the no-side-effect cost quotes.

## Purpose and features

- **Customers** check out the whole cart, a subset of cart lines (`itemIds`) or a single offer ("buy now"), passing payment details (mobile money or card).
- **Customers** get a quote (subtotal, shipping per group, total) for either flow before paying, once they have picked an address.
- A retry with the same `Idempotency-Key` and the same request returns the recorded outcome instead of checking out again. The same key with a different request answers 409.
- Cart lines are removed only once the payment is known to have been submitted, and only lines still exactly as checked out. A durable job created with the order retries the cleanup.

## Routes

Conventions (prefix, guards, envelope): see [../architecture.md](../architecture.md), [../auth-and-access.md](../auth-and-access.md). No route has `@Public`, `@Roles` or `@RequireVerifiedEmail`.

| Method | Path | Access | Idempotency | Description |
| --- | --- | --- | --- | --- |
| POST | /api/v1/checkout | Authenticated | Optional Idempotency-Key (UUID v4), per user, on a `CheckoutAttempt` | Order from cart or `itemIds`, then payment ([checkout.controller.ts:47](../../../services/commerce-api/src/modules/checkout/checkout.controller.ts#L47)) |
| POST | /api/v1/checkout/buy-now | Authenticated | Same as above | Order from one offer, cart untouched ([checkout.controller.ts:67](../../../services/commerce-api/src/modules/checkout/checkout.controller.ts#L67)) |
| POST | /api/v1/checkout/quote | Authenticated | n/a (no writes) | Cost breakdown for a cart checkout ([checkout.controller.ts:89](../../../services/commerce-api/src/modules/checkout/checkout.controller.ts#L89)) |
| POST | /api/v1/checkout/buy-now/quote | Authenticated | n/a | Cost breakdown for buy-now ([checkout.controller.ts:103](../../../services/commerce-api/src/modules/checkout/checkout.controller.ts#L103)) |

The key is optional; a present key that is not a UUID v4 gets 400. It is lowercased, so letter case does not matter ([checkout.controller.ts:27](../../../services/commerce-api/src/modules/checkout/checkout.controller.ts#L27)). The quote routes reuse the checkout DTOs, so they also accept (and ignore) `paymentDetails`.

**Omitting the key** gives no retry protection: a timed-out request, a double submit or a client retry without a key creates a second order and a second payment initialization. Clients should mint one UUID v4 per intended checkout and reuse it for every retry of that checkout.

**Request bodies**

- `CreateCheckoutDto` ([create-checkout.dto.ts:15](../../../services/commerce-api/src/modules/checkout/dto/create-checkout.dto.ts#L15)): `shippingAddressId` UUID; `currency` in `SUPPORTED_CURRENCIES` (only `ZMW`), default `ZMW`; optional `itemIds` array of UUID v4 (cart item ids); optional nested `paymentDetails` (`PaymentDetailsDto`, see [payments.md](payments.md#unifiedpaymentprovider)).
- `CreateBuyNowCheckoutDto` ([create-buy-now-checkout.dto.ts:17](../../../services/commerce-api/src/modules/checkout/dto/create-buy-now-checkout.dto.ts#L17)): `offerId` UUID; `quantity` int >= 1, default 1; `shippingAddressId`; `currency`; optional `paymentDetails`.

**Response** `CheckoutResult = { order, payment }` ([checkout.types.ts](../../../services/commerce-api/src/modules/checkout/checkout.types.ts)); `payment` may carry `redirectUrl`, `gatewayStatus` and `requiresReconciliation`. The order never includes the internal `checkoutCartSnapshot`. A replay returns the stored `data` byte for byte, including those payment fields. Quotes return `CheckoutQuote` from orders.

**409 codes.** Attempt conflicts put a machine-readable code in `error.details` as `{ field: 'code', message: <CODE> }`, plus `orderId` / `paymentId` entries when known ([checkout-attempt.errors.ts](../../../services/commerce-api/src/modules/checkout/checkout-attempt.errors.ts)):

| Code | Meaning for the client |
| --- | --- |
| `CHECKOUT_KEY_REUSED` | The key was used for a different request or operation. Use a new key |
| `CHECKOUT_KEY_LEGACY_RECEIPT` | The key belongs to a checkout that cannot be compared with a retry: an order from before receipts existed, a draft-era receipt, or a fingerprint key since removed from the ring. Check `orderId` before using a new key |
| `CHECKOUT_IN_PROGRESS` | Another request with this key is running, or took this one over. Retry the same key shortly |
| `CHECKOUT_REQUIRES_RECONCILIATION` | A payment exists whose outcome is unknown. Check the order and payment; do not check out again |
| `CHECKOUT_EXPIRED` | The interrupted checkout's reservations lapsed before payment started; its order was cancelled. Use a new key |
| `CHECKOUT_PAYMENT_FAILED` | The payment was refused and the order cancelled; nothing was charged. Use a new key |

Full conditions are in the [Stage 7 verification](../transactional-shopping-verification.md#checkout-idempotency).

## Services

| Service | Responsibility |
| --- | --- |
| `CheckoutService` ([checkout.service.ts](../../../services/commerce-api/src/modules/checkout/checkout.service.ts)) | `checkout`, `checkoutOffer`, `quote`, `quoteOffer`; private `execute`, `cancelAfterPaymentError`, `cleanUpCart`. Not exported. |
| `CheckoutAttemptsService` ([checkout-attempts.service.ts](../../../services/commerce-api/src/modules/checkout/checkout-attempts.service.ts)) | Keyed receipts: `run` (enter, replay, refuse, take over or resume, then classify a failure), `markPaymentStarted` (fenced, inside the Payment insert transaction) and `complete`. Not exported. |
| `CheckoutFingerprintService` ([checkout-fingerprint.ts](../../../services/commerce-api/src/modules/checkout/checkout-fingerprint.ts)) | HMAC-SHA256 over the normalized request under the `CHECKOUT_FINGERPRINT_KEYS` ring: `compute` with the active key; `verify` returns `match`, `mismatch` or `incomparable`. Also exports `normalizeCartCheckout`, `normalizeBuyNowCheckout`, `canonicalJson` and the keyring parser used by startup validation. |

## Business rules

```mermaid
sequenceDiagram
  participant A as CheckoutAttemptsService
  participant C as CheckoutService
  participant O as OrdersService
  participant P as PaymentsService
  participant K as CartService
  A->>A: keyed: find/create attempt (userId, key), verify fingerprint
  alt COMPLETED / REJECTED
    A-->>A: replay stored response / error
  else BLOCKED, live lease, or payment row on a lapsed attempt
    A-->>A: 409 with code
  else new, or claimed after lease lapse
    A->>C: execute(context)
    C->>O: createFromCart / createFromOffer (tx: order, attempt link, cart lock, stock locks, reservations, cleanup job)
    Note over C,O: or resume an existing order that still holds its reservations
    C->>P: initializeForOrder (tx: attempt guard, order lock, PENDING_PAYMENT check, Payment insert), then provider
    alt throws
      C->>O: cancel only if no charge can follow
      A->>A: classify: REJECTED / release / BLOCKED
    else accepted
      A->>A: complete (store response)
      C->>K: cleanUpCheckout (cart flow, not declined; best effort)
    end
  end
```

**Attempt receipts** ([checkout-attempts.service.ts](../../../services/commerce-api/src/modules/checkout/checkout-attempts.service.ts))

- Without a key, `run` calls the checkout directly: no receipt and no retry protection ([:141](../../../services/commerce-api/src/modules/checkout/checkout-attempts.service.ts#L141)).
- The fingerprint covers the normalized request built from the validated DTO ([checkout-fingerprint.ts:58](../../../services/commerce-api/src/modules/checkout/checkout-fingerprint.ts#L58)):
  - Cart: address, currency, `itemIds` (lowercased, de-duplicated, sorted; absent means the whole cart, and `[]` is a different request) and `paymentDetails`.
  - Buy-now: offer, quantity, address, currency and `paymentDetails`.
  - Payment details are included in full; that is why the fingerprint is an HMAC, and they are never stored. The order is built from the same normalized values.
- New key ([:231](../../../services/commerce-api/src/modules/checkout/checkout-attempts.service.ts#L231)):
  - If the user has a pre-receipt order with this key, or a draft attempt under another letter case, the request gets `CHECKOUT_KEY_LEGACY_RECEIPT` and creates nothing ([:286](../../../services/commerce-api/src/modules/checkout/checkout-attempts.service.ts#L286)).
  - Otherwise it creates an `IN_PROGRESS` attempt with an owner token and a 120 s lease.
  - A concurrent insert of the same key falls through to the existing attempt.
- Existing attempt ([:302](../../../services/commerce-api/src/modules/checkout/checkout-attempts.service.ts#L302)):
  - other operation or fingerprint mismatch → `CHECKOUT_KEY_REUSED`;
  - incomparable fingerprint (no metadata, other version, or key id not in the ring) → `CHECKOUT_KEY_LEGACY_RECEIPT`;
  - `COMPLETED` → stored response;
  - `REJECTED` → stored status and body;
  - `BLOCKED` → `CHECKOUT_REQUIRES_RECONCILIATION`, unless its payment is `FAILED`/`CANCELLED`;
  - `IN_PROGRESS` → take over.
- Take over ([:352](../../../services/commerce-api/src/modules/checkout/checkout-attempts.service.ts#L352)):
  - A live lease answers `CHECKOUT_IN_PROGRESS`.
  - With a lapsed lease, a Payment row for the linked order makes the attempt `BLOCKED`, unless that payment is `FAILED`/`CANCELLED`. In that case the order is cancelled if still pending and the key records `CHECKOUT_PAYMENT_FAILED` ([:483](../../../services/commerce-api/src/modules/checkout/checkout-attempts.service.ts#L483)).
  - Otherwise the retry claims the attempt with a compare-and-set and resumes ([:418](../../../services/commerce-api/src/modules/checkout/checkout-attempts.service.ts#L418)). With no order linked, it runs a full checkout. With an order that is `PENDING_PAYMENT` and holds every reservation `ACTIVE` and unexpired, it continues at payment initialization. Otherwise it cancels the order and records `CHECKOUT_EXPIRED`.
- Fencing: the order link (in the order transaction) and `markPaymentStarted` (in the Payment insert transaction, [:180](../../../services/commerce-api/src/modules/checkout/checkout-attempts.service.ts#L180)) only succeed for the current owner. A request that lost its attempt gets `CHECKOUT_IN_PROGRESS`, records nothing and creates no payment.
- Failure classification ([:549](../../../services/commerce-api/src/modules/checkout/checkout-attempts.service.ts#L549)) runs only while this request still owns the attempt:
  - A definite failure (HTTP < 500) before any payment, or a cancelled order, is recorded `REJECTED`.
  - A transient failure before any payment releases the attempt so the next retry resumes.
  - A `FAILED`/`CANCELLED` payment is recorded `REJECTED`.
  - Any other payment makes the attempt `BLOCKED`.
- `complete` stores the response after payment initialization and before cart cleanup, keyed on the order, so it also overrides a `BLOCKED` written by a retry that misjudged the lease ([:205](../../../services/commerce-api/src/modules/checkout/checkout-attempts.service.ts#L205)).

**Execution** ([checkout.service.ts:161](../../../services/commerce-api/src/modules/checkout/checkout.service.ts#L161))

- **Order creation** is delegated to `OrdersService` (selection, availability, grouping, shipping quotes, cart snapshot verification, stock locks, reservations, durable cleanup job); see [orders.md](orders.md#business-rules). A resumed attempt reuses its existing order instead.
- **Payment start** passes a guard that runs `markPaymentStarted` inside the Payment insert transaction. That transaction also locks the order and requires `PENDING_PAYMENT` ([payments.md](payments.md#business-rules)).
- **Payment failure** ([checkout.service.ts:218](../../../services/commerce-api/src/modules/checkout/checkout.service.ts#L218)): the order is cancelled, releasing its stock, only when no charge can follow. That means the Payment row is `FAILED`/`CANCELLED`, or there is no row and the error is definite or the request is keyless. The error is rethrown and the cart is left alone.
- **Inline decline** ([checkout.service.ts:200](../../../services/commerce-api/src/modules/checkout/checkout.service.ts#L200)): a `FAILED`/`CANCELLED` payment has already cancelled the order, so the order is re-read with `findOwn` and returned, and the cart is kept.
- **Cart cleanup** (cart flow, not declined; [checkout.service.ts:244](../../../services/commerce-api/src/modules/checkout/checkout.service.ts#L244)) calls `CartService.cleanUpCheckout(userId, orderId)` as a best effort after the response is recorded. A failure is logged and never fails the response; the `cart.cleanup_items` job that the order transaction enqueued keeps retrying. See [cart.md](cart.md#jobs-and-events).
- **Buy now** follows the same flow and never reads or writes the cart.
- **Quotes** pass straight through to `OrdersService.quoteFromCart` / `quoteFromOffer`.

## Data

`CheckoutAttemptsService` reads and writes `CheckoutAttempt` directly. It reads `Order` and `Reservation` status, and reads `orders.idempotency_key` and `checkout_attempts.key` with raw case-insensitive queries for legacy receipts. Other writes happen through `OrdersService` (`Order`, `SellerOrder`, `ShippingGroup`, `OrderItem`, reservations, the `cart.cleanup_items` job), `PaymentsService` (`Payment`, `PaymentSettlement`, `PaymentEvent`) and `CartService` (`CartItem`). The table is described in [../data-model.md](../data-model.md).

## Dependencies

- Imports `OrdersModule`, `PaymentsModule` and `CartModule` ([checkout.module.ts](../../../services/commerce-api/src/modules/checkout/checkout.module.ts)).
- `checkout-attempt.errors.ts` has no orders, cart or payments imports, so `OrdersService` and `PaymentsService` can import the fence error, codes and lease from it.

## Jobs and events

- The durable `cart.cleanup_items {userId, orderId}` job is enqueued by `OrdersService` inside the order transaction and again by `confirmPayment`. Checkout itself enqueues nothing. See [cart.md](cart.md#jobs-and-events).
- Order/payment events (`order.paid`, `fulfillment.provision`) are emitted by orders when the payment settles.

## Configuration

`CHECKOUT_FINGERPRINT_ACTIVE_KEY_ID` and `CHECKOUT_FINGERPRINT_KEYS` (required); see [../configuration.md](../configuration.md#checkout). Payment behavior depends on `PAYMENTS_PROVIDER` and the gateway/FX settings in [payments.md](payments.md#configuration).

## Tests

- [checkout.service.spec.ts](../../../services/commerce-api/src/modules/checkout/checkout.service.spec.ts), [checkout-attempts.service.spec.ts](../../../services/commerce-api/src/modules/checkout/checkout-attempts.service.spec.ts), [checkout-fingerprint.spec.ts](../../../services/commerce-api/src/modules/checkout/checkout-fingerprint.spec.ts): flow, cancellation rules, cleanup, attempt states and classification, normalization, canonical JSON and keyring parsing.
- [test/checkout-idempotency.integration-spec.ts](../../../services/commerce-api/test/checkout-idempotency.integration-spec.ts) (real PostgreSQL): concurrent same-key requests, replays, recorded refusals, key reuse, legacy receipts, every crash boundary, stale owners and `BLOCKED` resolution. Results: [Stage 7 verification](../transactional-shopping-verification.md#verification).
- [test/cart-cleanup.integration-spec.ts](../../../services/commerce-api/test/cart-cleanup.integration-spec.ts), [test/checkout.integration-spec.ts](../../../services/commerce-api/test/checkout.integration-spec.ts) and [checkout.e2e-spec.ts](../../../services/commerce-api/test/checkout.e2e-spec.ts): cleanup and the HTTP flow with a fake provider.

## Known gaps

- `Idempotency-Key` is optional by product decision. Keyless requests, and retries that mint a new key, have no retry protection.
- A `BLOCKED` attempt answers `CHECKOUT_REQUIRES_RECONCILIATION` until it is reconciled through the order and payment APIs, even after the payment settles. Only a payment that turns out `FAILED`/`CANCELLED` is converted automatically (`CHECKOUT_PAYMENT_FAILED`).
- A keyed checkout that fails transiently after its order commits, and is never retried, leaves a `PENDING_PAYMENT` order without a payment. It holds its stock for up to about 16 minutes, until `orders.expire_unpaid` cancels it and the key starts answering `CHECKOUT_EXPIRED`. A same-key retry resumes the order only while every reservation has at least 5 minutes left. See [Stage 7: unpaid orders](../transactional-shopping-verification.md#unpaid-orders-cancellation-and-resumption).
- In a narrow lease-renewal race, a retry can mark a live owner's attempt `BLOCKED`. The owner's completion still overrides it.
- Removing a key from `CHECKOUT_FINGERPRINT_KEYS` turns its receipts into `CHECKOUT_KEY_LEGACY_RECEIPT` answers.
- On success, the returned and replayed `order` is the one read before payment, so an inline `SUCCEEDED` payment still shows the order as `PENDING_PAYMENT` ([checkout.service.ts:201](../../../services/commerce-api/src/modules/checkout/checkout.service.ts#L201)).
- After the gateway accepted a payment (provider reference recorded), the checked-out lines are removed even if that payment later fails; the customer must re-add them.
- No `@RequireVerifiedEmail()` on checkout routes.
- `quantity` on buy-now has no upper bound in the DTO; limits rely on stock reservation ([create-buy-now-checkout.dto.ts:21](../../../services/commerce-api/src/modules/checkout/dto/create-buy-now-checkout.dto.ts#L21)).
