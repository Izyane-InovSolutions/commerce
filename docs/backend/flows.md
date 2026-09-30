# End-to-end flows

> The main business flows as they run through the modules. Each step links to the module doc that has the detail.

Paths below leave out the `/api/v1` prefix.

## 1. Purchase: browse → pay → deliver → review

```mermaid
sequenceDiagram
  autonumber
  actor C as Customer
  participant Cat as catalog / products / offers
  participant Cart as cart
  participant Co as checkout
  participant O as orders
  participant Inv as inventory
  participant P as payments
  participant GW as Unified gateway
  participant L as financials (ledger)
  participant Q as job queue
  participant F as fulfillment
  participant S as shipments
  participant R as reviews
  C->>Cat: GET catalog/products, catalog/variants/:id/offers (public)
  C->>Cart: POST cart/items (guest via x-guest-token, or signed in)
  C->>Cart: POST cart/merge after login
  C->>Co: POST checkout/quote (shipping per seller group)
  C->>Co: POST checkout {addressId, paymentDetails} + Idempotency-Key
  Co->>O: createFromCart (one tx)
  O->>Inv: reserve stock per item (15 min hold, expiry job queued)
  O->>L: ensureCurrency per seller
  Co->>P: initializeForOrder
  P->>GW: POST /api/v1/payments (mobile money / card)
  GW-->>P: PENDING (subscriber must approve) | SUCCESS | FAILED
  alt succeeded inline
    P->>O: confirmPayment
  else pending
    C->>P: POST payments/:id/status (poll)
    P->>GW: POST /payments/{id}/status
    GW-->>P: SUCCESS
    P->>O: confirmPayment
  else failed / cancelled
    P->>O: cancel → reservations released, cart kept
  end
  O->>Inv: commit reservations
  O->>L: recordSale per seller order (commission, hold)
  O->>Q: fulfillment.provision + outbox order.paid
  Co->>Cart: remove checked-out lines (retry job if it fails)
  Q->>F: provision fulfillment order per shipping group
  alt platform fulfillment
    F->>F: staff pick → pack → dispatch
    F->>S: shipment created → book with carrier
  else seller fulfillment
    F->>F: seller accept → pack → dispatch
    F->>S: shipment created as DISPATCHED
  end
  S->>S: tracking events → DELIVERED
  C->>R: POST reviews/products, reviews/sellers (once fully delivered)
```

### Key rules along the way

- **Checkout idempotency.** Sending the same `Idempotency-Key` again returns the order and payment that already exist. If the first attempt never reached payment, the key is released and checkout starts over. See [checkout.md](modules/checkout.md).
- **Order split.** An order splits into one **SellerOrder per seller** (the platform counts as seller `null`), and each of those into **ShippingGroups**. Every shipping group is quoted, fulfilled and shipped on its own. See [orders.md](modules/orders.md).
- **Unknown payment outcome.** If the gateway times out or its answer is unclear, the payment is kept, flagged `requiresReconciliation`, and **stock stays reserved**. The order is never cancelled on a guess. See [payments.md](modules/payments.md).
- **No verified gateway webhooks yet.** Pending unified payments can settle through `POST payments/:id/status` or the background reconciliation scheduler/job. Referenced attempts can also expire through that worker. This does not prove safe late-success recovery. See [integrations.md](integrations.md#payments).
- **Reservation expiry race.** The stock hold is 15 minutes, and the gateway's mobile-money window in its sample responses is also 15 minutes. When the `inventory.expire_reservation` job runs, it marks the reservation `EXPIRED` but **leaves the order in `PENDING_PAYMENT`**. If the customer approves the charge after that, `confirmPayment` tries to commit an `EXPIRED` reservation and fails with 409 ([orders.service.ts:593-597](../../services/commerce-api/src/modules/orders/orders.service.ts#L593-L597), [inventory.service.ts:694-698](../../services/commerce-api/src/modules/inventory/inventory.service.ts#L694-L698)). The money is taken, but the order is never marked paid. See [known-gaps.md](known-gaps.md#high-impact).
- **Late success after cancellation.** A payment success that arrives after the order was cancelled also returns 409 and needs manual reconciliation.
- **Seller money.** Sale proceeds, net of `MARKETPLACE_COMMISSION_BPS`, go to the seller's **held** balance until `SELLER_PAYOUT_HOLD_DAYS` has passed. See [financials.md](modules/financials.md).

## 2. Return → refund

```mermaid
sequenceDiagram
  autonumber
  actor C as Customer
  participant Rt as returns
  actor A as Staff / Admin
  participant Inv as inventory
  participant RC as payments (refund cases)
  participant GW as gateway
  participant L as ledger
  participant O as orders
  C->>Rt: GET orders/:id/return-eligibility
  C->>Rt: POST orders/:id/returns (+Idempotency-Key) → REQUESTED
  A->>Rt: approve → APPROVED (RMA number)
  A->>Rt: POST receipts → RECEIVING / RECEIVED
  A->>Rt: POST inspections (disposition per line)
  Rt->>Inv: RESTOCK lines → receiveReturnedStock
  A->>Rt: finalize → per seller order, prepareCase (source RETURN)
  Rt->>RC: process refund case
  RC->>GW: refund (not supported yet → FAILED / RECONCILIATION_REQUIRED)
  RC->>L: recordRefundReversal (proportional commission reversal)
  RC->>O: applyRefund → PARTIALLY_REFUNDED / REFUNDED
  RC->>Rt: return status → REFUNDED / PARTIALLY_REFUNDED / REFUND_FAILED
```

- **Eligibility.** The product must be returnable, and the return must be within `returnWindowDays` (default 30) of **each delivered shipment line**. Quantities already claimed by other active returns are excluded. See [returns.md](modules/returns.md).
- **Refunds do not restock.** Only inspection with the `RESTOCK` disposition returns goods to inventory.
- **Cancellation refunds.** Cancelling a _paid_ fulfillment quantity takes the same refund path, through the `refunds.process_fulfillment_cancellation` job (source `FULFILLMENT_CANCELLATION`). Admins can also refund a seller order directly: `POST admin/seller-orders/:id/refund`.
- **Refunds cannot complete today.** The gateway has no refund contract, so a refund case ends in `FAILED` or `RECONCILIATION_REQUIRED`, and an admin retries or reconciles it (`POST admin/refunds/:id/status`, `POST admin/returns/:id/refund-cases/:caseId/retry`). See [known-gaps.md](known-gaps.md).

## 3. Seller lifecycle: apply → sell → get paid

```mermaid
sequenceDiagram
  autonumber
  actor U as Customer
  participant Au as auth
  participant Se as sellers
  actor Ad as Admin
  participant Pr as products
  participant Of as offers
  participant Inv as inventory
  participant L as ledger
  participant Po as payouts
  U->>Au: verify email (required for seller routes)
  U->>Se: POST sellers/applications (KYC documents) → PENDING
  Ad->>Se: approve → APPROVED, user role → SELLER
  U->>Se: PUT sellers/me/storefront (slug, profile)
  U->>Pr: POST sellers/me/products (+variants, media) → submission PENDING
  Ad->>Pr: approve submission → product and variants PUBLISHED
  U->>Of: POST sellers/me/offers, POST :id/prices, PATCH :id/status PUBLISHED
  U->>Inv: PUT sellers/me/inventory/:offerId (seller-held stock)
  Note over U,L: sales flow 1 → recordSale → heldBalance → available after hold days
  U->>Po: POST sellers/me/payout-accounts → PENDING_VERIFICATION
  Ad->>Po: verify account → VERIFIED
  U->>Po: POST sellers/me/payout-requests → REQUESTED (available → pending)
  Ad->>Po: approve → APPROVED
  Po->>Po: 60 s scheduler batches → PROCESSING → manual provider → RECONCILIATION_REQUIRED
  Ad->>Po: resolve SUCCEEDED (Payout + PAYOUT ledger entry, pending → paid) or FAILED (funds returned)
```

- **Email verification.** Seller routes need a verified email. Sellers who existed before `20260928150000_email_verification_rollout` were given a 30-day grace period. See [auth-and-access.md](auth-and-access.md#email-verification).
- **Offers.** A seller can list an existing platform product without submitting a new one, by creating an offer on a published variant. See [offers.md](modules/offers.md).
- **Suspension.** Suspending a seller hides the storefront and blocks every seller write, because those writes go through `lockApproved`. See [sellers.md](modules/sellers.md).

## 4. Procurement → stock

```mermaid
sequenceDiagram
  autonumber
  actor St as Staff
  actor Ad as Admin
  participant PO as purchase orders
  participant GR as goods receipts
  participant Inv as inventory
  St->>PO: POST (DRAFT) → submit → SUBMITTED
  Ad->>PO: approve → APPROVED (not the creator)
  St->>PO: place → ORDERED
  St->>GR: POST purchase-orders/:id/receipts (DRAFT) → post
  GR->>Inv: receiveStockForReference (accepted qty) → movement RECEIPT
  GR->>PO: PARTIALLY_RECEIVED / RECEIVED
  St->>PO: close-short (if the supplier will not deliver the rest)
  Ad->>GR: reverse → offsetting receipt, stock reversed
```

See [procurement.md](modules/procurement.md).
