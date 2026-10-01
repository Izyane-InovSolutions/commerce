# API Testing Guide (Swagger)

Everything you need to exercise every endpoint in `commerce-api` via Swagger UI.

> This guide predates reviews, saved sellers, email verification and session management. The current route tables, with access rules, are in the module pages under [docs/backend/](../../docs/backend/README.md#modules).

## 1. Setup

1. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `JWT_SECRET` (32+ chars), `MEDIA_SIGNING_SECRET` (32+ chars). Keep `NODE_ENV=development`.
2. Run migrations + seed:
   ```
   npm run prisma:migrate
   npm run prisma:seed
   ```
   Seed only runs when `NODE_ENV` is `development` or `test`. It creates:
   - An **ADMIN** user: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (defaults: `admin@example.test` / `DemoAdmin123!`)
   - 3 categories + 18 published demo products/variants/offers (currency `ZMW`) so catalog GETs return real data.
3. Start the app: `npm run start:dev`
4. Open Swagger UI: **`http://localhost:3000/api/docs`**

Optional settings worth knowing while testing (see `.env.example`):
- **Email** — auth reset/verification uses encrypted queued SMTP delivery (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`) and `CUSTOMER_WEB_URL` links. It does not log raw tokens when SMTP is absent. Notification email has its own SMTP/log adapter; its fallback does not replace required auth mail configuration.
- **Media** — `MEDIA_STORAGE_DRIVER=local` (default) stores uploads under `MEDIA_STORAGE_PATH`; `s3` uses the `S3_*` settings.
- **Background workers** run in the API process: the outbox dispatcher and notifications subscriber, notification email delivery, payment reconciliation (unified gateway only), FX refresh, shipment tracking polls and payout processing. So a notification appears a few seconds after the action that caused it.

All routes are mounted under the prefix **`/api/v1`** (Swagger UI shows this already, e.g. `POST /api/v1/auth/login`).

## 2. Auth model — read this first

A global `JwtAuthGuard` + `RolesGuard` protect **every** endpoint by default. Only endpoints explicitly marked `[Public]` below skip auth, and `[Optional]` ones work with or without a token. Everything else needs a Bearer token; endpoints marked `[Roles: X]` additionally require the logged-in user's role to be one of `X`.

Roles: `CUSTOMER | SELLER | STAFF | ADMIN`.

### How to authenticate in Swagger
1. `POST /auth/login` with:
   ```json
   { "email": "admin@example.test", "password": "DemoAdmin123!" }
   ```
   (or use a self-registered customer, see below). Response includes `data.accessToken`.
2. Click the **Authorize** button (top right of Swagger UI) and paste just the token (no `Bearer ` prefix needed — Swagger adds it).
3. All subsequent calls in that session send the token automatically. Access tokens expire in 15 min (`ACCESS_TOKEN_TTL_SECONDS`); use `POST /auth/refresh` or just log in again.

### Getting each role for testing
- **ADMIN**: use the seeded admin above.
- **CUSTOMER**: `POST /auth/register` with `{ "email": "...", "password": "..." }` — always creates a CUSTOMER.
- **SELLER**: register a customer, then `POST /sellers/applications` as that user (see body below), then log in as ADMIN and `POST /admin/sellers/:id/approve`. The user's role flips to SELLER on approval.
- **STAFF**: not obtainable via any endpoint — set `role = STAFF` directly on a user row in the DB (Prisma Studio: `npx prisma studio`).

Sessions are checked on every request (not just the JWT signature) — logging out, changing password, or refresh-token reuse immediately invalidates a session server-side even before the JWT expires.

### Idempotency-Key header
Several mutating endpoints accept or require an `Idempotency-Key` header: checkout, refunds, fulfillment work (admin and seller), shipment creation and seller tracking events, returns (request, receipts, inspections), review edits/deletes/reports and moderation, and payouts. Use any UUID v4, e.g. generate one per request in Swagger's header field.

---

## 3. Endpoints, auth, and request bodies

Legend: `[Public]` no auth · `[Optional]` auth optional · unmarked = any logged-in user · `[Roles: X]` also needs that role.

### Auth — `/auth`
| Method & Path | Auth | Body |
|---|---|---|
| POST `/auth/register` | [Public] | `{ "email": "user@test.com", "password": "Passw0rd!" }` |
| POST `/auth/login` | [Public] | `{ "email": "user@test.com", "password": "Passw0rd!" }` |
| POST `/auth/refresh` | [Public] | `{ "refreshToken": "<from login response>" }` |
| POST `/auth/logout` | auth | `{ "refreshToken": "<...>" }` |
| GET `/auth/me` | auth | — |
| PATCH `/auth/me/password` | auth | `{ "currentPassword": "...", "newPassword": "NewPassw0rd!" }` |
| POST `/auth/password-reset/request` | [Public] | `{ "email": "user@test.com" }` — queues an encrypted delivery with a `CUSTOMER_WEB_URL/reset-password?token=...` link; retrieve the link from your configured test mailbox |
| POST `/auth/password-reset/confirm` | [Public] | `{ "token": "<from the email link>", "newPassword": "NewPassw0rd!" }` |
| POST `/auth/handoff` | auth | — returns a one-time code for signing the same user into another app (web → seller) |
| POST `/auth/handoff/exchange` | [Public] | `{ "code": "<from /auth/handoff>" }` → token pair |
| GET `/auth/sessions` | auth | — |
| DELETE `/auth/sessions/:id` | auth | — (`id` = session UUID) |

### Users — `/users`
| Method & Path | Auth | Body |
|---|---|---|
| GET `/users/me` | auth | — |
| PATCH `/users/me` | auth | `{ "firstName": "Jane", "lastName": "Doe", "phone": "+260971234567" }` (all optional) |

### Admin users — `/admin/users` `[Roles: ADMIN]`
| Method & Path | Body |
|---|---|
| GET `/admin/users?q=&role=&status=ACTIVE&page=&limit=` | — (`status`: ACTIVE, DISABLED) |
| GET `/admin/users/:id` | — |
| PATCH `/admin/users/:id/role` | `{ "role": "STAFF", "expectedRole": "CUSTOMER", "reason": "joined ops" }` (409 if the role changed since you read it) |
| POST `/admin/users/:id/disable` \| `/enable` | `{ "reason": "..." }` (optional) — disabling revokes the user's sessions |

### Addresses — `/users/me/addresses`
| Method & Path | Auth | Body |
|---|---|---|
| GET `/users/me/addresses` | auth | — |
| GET `/users/me/addresses/:id` | auth | — |
| POST `/users/me/addresses` | auth | `{ "recipientName": "Jane Doe", "line1": "123 Main St", "city": "Lusaka", "postalCode": "10101", "country": "ZM", "label": "Home", "phone": "+260971234567" }` |
| PATCH `/users/me/addresses/:id` | auth | any subset of the above |
| DELETE `/users/me/addresses/:id` | auth | — |
| POST `/users/me/addresses/:id/default` | auth | — |

### Public catalog (browse products) — no auth needed
| Method & Path | Auth |
|---|---|
| GET `/catalog/categories` | [Public] |
| GET `/catalog/categories/:slug` | [Public] |
| GET `/catalog/brands` | [Public] |
| GET `/catalog/brands/:slug` | [Public] |
| GET `/catalog/products?page=1&limit=20&currency=ZMW&q=&categorySlug=&brandSlug=` | [Public] |
| GET `/catalog/products/:slug?currency=ZMW` | [Public] |
| GET `/catalog/products/:slug/reviews?page=&limit=&rating=&sort=newest` | [Public] (`sort`: newest, oldest, highest, lowest) |
| GET `/catalog/best-sellers?limit=12&days=30&currency=ZMW` | [Public] — ranked by units sold on paid orders in the window |
| GET `/catalog/variants/:id/offers` | [Public] |
| GET `/catalog/offers/:id` | [Public] |
| GET `/storefronts/:slug/offers` | [Public] |
| GET `/storefronts/:slug/ratings` | [Public] |

### Admin catalog management — `[Roles: STAFF, ADMIN]`
| Method & Path | Body |
|---|---|
| GET/POST/PATCH/DELETE `/admin/catalog/categories(/:id)` | Create: `{ "name": "Electronics", "slug": "electronics", "description": "...", "parentId": null }` |
| GET/POST/PATCH/DELETE `/admin/catalog/brands(/:id)` | Create: `{ "name": "Acme", "slug": "acme", "description": "..." }` |
| GET/POST/PATCH/DELETE `/admin/catalog/attributes(/:id)` | Create: `{ "name": "Color", "code": "color" }` |
| POST `/admin/catalog/attributes/:id/values` | `{ "value": "Red" }` |
| PATCH/DELETE `/admin/catalog/attributes/:id/values/:valueId` | `{ "value": "Blue" }` |

### Admin products — `/admin/catalog/products` `[Roles: STAFF, ADMIN]`
| Method & Path | Body |
|---|---|
| GET `/admin/catalog/products`, GET `/admin/catalog/products/:id` | — |
| GET `/admin/catalog/products/submissions/pending` | — seller-submitted products awaiting review |
| POST `/admin/catalog/products/:id/submissions/approve` \| `/reject` | `{ "reason": "..." }` |
| POST `/admin/catalog/products` | `{ "name": "Wireless Mouse", "slug": "wireless-mouse", "description": "...", "brandId": "<uuid>", "categoryId": "<uuid>" }` |
| PATCH `/admin/catalog/products/:id` | any subset |
| PATCH `/admin/catalog/products/:id/status` | `{ "status": "PUBLISHED" }` (enum: DRAFT, PUBLISHED, ARCHIVED) |
| DELETE `/admin/catalog/products/:id` | — |
| POST `/admin/catalog/products/:id/variants` | `{ "skuCode": "WM-001", "name": "Black", "attributeValueIds": ["<uuid>"] }` |
| PATCH `/admin/catalog/products/:id/variants/:variantId` | any subset |
| PATCH `/admin/catalog/products/:id/variants/:variantId/status` | `{ "status": "PUBLISHED" }` |
| DELETE `/admin/catalog/products/:id/variants/:variantId` | — |
| POST `/admin/catalog/products/:id/media` | `{ "mediaAssetId": "<uuid>", "position": 0, "isPrimary": true }` (upload the asset via `/media` endpoints first) |
| PATCH `/admin/catalog/products/:id/media/:mediaId` | `{ "position": 1, "isPrimary": false }` |
| DELETE `/admin/catalog/products/:id/media/:mediaId` | — |

### Offers
| Method & Path | Auth | Body |
|---|---|---|
| POST `/admin/catalog/offers` | [Roles: STAFF, ADMIN] | `{ "variantId": "<uuid>" }` |
| GET `/admin/catalog/offers?status=&sellerId=&variantId=&productId=&page=&limit=` | [Roles: STAFF, ADMIN] | — |
| GET `/admin/catalog/offers/:id` | [Roles: STAFF, ADMIN] | — |
| PATCH `/admin/catalog/offers/:id/shipping` | [Roles: STAFF, ADMIN] | `{ "amount": 3000, "currency": "ZMW" }` or `{ "amount": null }` — first-party offers; shown in the catalog, checkout still charges the zone rate |
| PATCH `/admin/catalog/offers/:id/status` | [Roles: STAFF, ADMIN] | `{ "status": "PUBLISHED" }` |
| DELETE `/admin/catalog/offers/:id` | [Roles: STAFF, ADMIN] | — |
| POST `/admin/catalog/offers/:id/prices` | [Roles: STAFF, ADMIN] | `{ "amount": 15000, "currency": "ZMW" }` (amount in minor units) |
| GET/POST/PATCH `/sellers/me/offers(/:id)` | [Roles: SELLER] | Create: `{ "variantId": "<uuid>", "sellerSku": "SKU-1", "listingTitle": "Great mouse", "condition": "NEW", "stockSource": "SELLER", "fulfillmentMode": "SELLER" }`; Update adds `"version": 0` |
| PATCH `/sellers/me/offers/:id/status` | [Roles: SELLER] | `{ "version": 0, "status": "PUBLISHED" }` |
| POST `/sellers/me/offers/:id/prices` | [Roles: SELLER] | `{ "version": 0, "amount": 15000, "currency": "ZMW" }` |

### Inventory
| Method & Path | Auth | Body |
|---|---|---|
| GET `/admin/inventory?warehouseId=&variantId=` | [Roles: STAFF, ADMIN] | — |
| POST `/admin/inventory/receive` | [Roles: STAFF, ADMIN] | `{ "warehouseId": "<uuid>", "variantId": "<uuid>", "quantity": 100, "note": "restock" }` |
| POST `/admin/inventory/adjust` | [Roles: STAFF, ADMIN]; optional UUID-v4 `Idempotency-Key` | `{ "warehouseId": "<uuid>", "variantId": "<uuid>", "delta": -5, "note": "damage" }` |
| GET `/admin/inventory/:id/movements` \| `/reservations` | [Roles: STAFF, ADMIN] | — |
| PATCH `/admin/inventory/:id/reorder-point` | [Roles: STAFF, ADMIN] | `{ "reorderPoint": 10 }` |
| GET `/sellers/me/inventory` | [Roles: SELLER] | — |
| PUT `/sellers/me/inventory/:offerId` | [Roles: SELLER] | `{ "quantity": 20, "version": 0, "note": "restock" }` |
| PATCH `/sellers/me/inventory/bulk` | [Roles: SELLER] | `{ "items": [{ "offerId": "<uuid>", "quantity": 20, "version": 0 }] }` |
| GET `/sellers/me/inventory/:offerId/movements` | [Roles: SELLER] | — |
| GET/POST/PATCH/DELETE `/admin/inventory/warehouses(/:id)` | [Roles: STAFF, ADMIN] | Create: `{ "name": "Main WH", "code": "MAIN-01" }`; PATCH also takes `"isActive": false`. DELETE returns 409 for a warehouse that holds stock records or is referenced by purchasing, fulfillment or return records — deactivate it instead |

### Seller products — `/sellers/me/products` (approved seller)
New catalog products a seller submits for admin review (distinct from offers on existing products).

| Method & Path | Body |
|---|---|
| GET `/sellers/me/products`, GET `/sellers/me/products/:id` | — |
| POST `/sellers/me/products` | `{ "name": "Handmade Basket", "slug": "handmade-basket", "description": "...", "categoryId": "<uuid>" }` |
| PATCH `/sellers/me/products/:id` | `{ "name": "...", "description": "...", "brandId": null, "categoryId": "<uuid>" }` (any subset) |
| DELETE `/sellers/me/products/:id` | — |
| POST `/sellers/me/products/:id/variants` | `{ "skuCode": "BASKET-L", "name": "Large" }` |
| PATCH/DELETE `/sellers/me/products/:id/variants/:variantId` | PATCH: any subset of the create body |
| POST `/sellers/me/products/:id/media` | `{ "mediaAssetId": "<uuid>", "position": 0, "isPrimary": true }` |

### Procurement — all `[Roles: STAFF, ADMIN]` (approve/reject/reverse `[Roles: ADMIN]` only)
| Method & Path | Body |
|---|---|
| GET/POST/PATCH `/admin/procurement/suppliers(/:id)` | Create: `{ "code": "SUP-01", "legalName": "Acme Supplies", "contactEmail": "supplier@test.com", "defaultCurrency": "ZMW" }` |
| POST `/admin/procurement/suppliers/:id/deactivate` | `{ "version": 0 }` |
| GET/POST `/admin/procurement/suppliers/:supplierId/products` | Create: `{ "variantId": "<uuid>", "supplierSku": "SUP-SKU-1", "defaultUnitCost": 5000, "currency": "ZMW" }` |
| PATCH `/admin/procurement/suppliers/:supplierId/products/:id` | any subset + `isActive` |
| GET/POST `/admin/procurement/purchase-orders` | Create: `{ "supplierId": "<uuid>", "warehouseId": "<uuid>", "currency": "ZMW", "lines": [{ "variantId": "<uuid>", "orderedQuantity": 10, "unitCostAmount": 5000 }] }` |
| PATCH `/admin/procurement/purchase-orders/:id` | `{ "version": 0, ...any create field }` (DRAFT only) |
| POST `/admin/procurement/purchase-orders/:id/submit` \| `/return-to-draft` \| `/place` \| `/cancel` \| `/close-short` | `{ "version": 0, "reason": "..." }` |
| POST `/admin/procurement/purchase-orders/:id/approve` \| `/reject` | **[Roles: ADMIN]** `{ "version": 0, "reason": "..." }` |
| POST `/admin/procurement/purchase-orders/:id/revise` | `{ "version": 0, ... }` |
| GET/POST `/admin/procurement/purchase-orders/:purchaseOrderId/receipts` | Create: `{ "warehouseId": "<uuid>", "post": true, "lines": [{ "purchaseOrderLineId": "<uuid>", "deliveredQuantity": 10, "acceptedQuantity": 10 }] }` |
| GET/PATCH/DELETE `/admin/procurement/goods-receipts/:id` | PATCH same shape as create |
| POST `/admin/procurement/goods-receipts/:id/post` | — |
| POST `/admin/procurement/goods-receipts/:id/reverse` | **[Roles: ADMIN]** `{ "reason": "damaged goods" }` |

### Cart — `/cart` `[Optional auth]` (guest via `x-guest-token` header, returned on first call)
| Method & Path | Body |
|---|---|
| GET `/cart` | — |
| POST `/cart/items` | `{ "offerId": "<uuid>", "quantity": 1 }` |
| PATCH `/cart/items/:itemId` | `{ "quantity": 2 }` |
| DELETE `/cart/items/:itemId` | — |
| POST `/cart/merge` (auth required, not optional) | — merges guest cart (send `x-guest-token` header) into logged-in account |

### Wishlist — `/wishlist` (auth)
| Method & Path | Body |
|---|---|
| GET `/wishlist` | — |
| POST `/wishlist` | `{ "offerId": "<uuid>" }` |
| DELETE `/wishlist/:offerId` | — |

### Checkout — `/checkout` (auth) — header `Idempotency-Key: <uuid v4>` optional
| Method & Path | Body |
|---|---|
| POST `/checkout` | `{ "shippingAddressId": "<uuid>", "currency": "ZMW", "paymentDetails": { "paymentMethod": "MOBILE_MONEY", "phoneNumber": "0971234567", "provider": "MTN" } }` |
| POST `/checkout/buy-now` | `{ "offerId": "<uuid>", "quantity": 1, "shippingAddressId": "<uuid>", "currency": "ZMW", "paymentDetails": {...} }` |
| POST `/checkout/quote` \| `/checkout/buy-now/quote` | same bodies without `paymentDetails` — returns subtotal, shipping and total without creating an order |

Shipping is quoted by `ZoneShippingRateProvider`: a domestic (`SHIPPING_DOMESTIC_COUNTRY`, default `ZM`) flat rate that is free above `SHIPPING_DOMESTIC_FREE_THRESHOLD_MINOR`, and a flat international rate elsewhere. Checkout reserves stock in the same transaction that creates the order.

Card payment example for `paymentDetails`:
```json
{
  "paymentMethod": "CARD",
  "card": {
    "number": "4111111111111111",
    "expiryMonth": "12",
    "expiryYear": "2030",
    "securityCode": "123",
    "holderName": "Jane Doe",
    "billing": {
      "firstName": "Jane",
      "lastName": "Doe",
      "address1": "123 Main St",
      "administrativeArea": "Lusaka",
      "postalCode": "10101",
      "country": "ZM",
      "email": "jane@test.com"
    }
  }
}
```
> Note: with the default `.env` (`PAYMENTS_PROVIDER=pending`), checkout does **not** leave an order behind: payment initialisation is refused with 503, and checkout cancels the order it just created (releasing the stock) before rethrowing. Set `PAYMENTS_PROVIDER=unified` with the gateway variables to place orders end to end.

### Orders
| Method & Path | Auth | Body |
|---|---|---|
| GET `/orders`, GET `/orders/:id` | auth (own orders) | — |
| POST `/orders/:id/cancel` | auth (own order) | — cancels a `PENDING_PAYMENT` order, releasing its stock and cancelling its payment; 409 once paid (use fulfillment cancellation or a return); retrying on a cancelled order returns it unchanged |
| GET `/admin/orders?status=&page=&limit=`, GET `/admin/orders/:id` | [Roles: STAFF, ADMIN] | — |
| POST `/admin/orders/:id/cancel` | [Roles: STAFF, ADMIN] | — same rules as the customer cancel |
| GET `/sellers/me/orders?status=&fulfillmentStatus=&fulfillmentMode=&dateFrom=&dateTo=&page=&limit=`, GET `/sellers/me/orders/:id` | approved seller | — |

### Payments
| Method & Path | Auth | Body |
|---|---|---|
| POST `/payments/webhook` | [Public] | raw provider payload + `x-webhook-signature` header — hard to test manually from Swagger; used by the payment gateway itself |
| GET `/payments/:id` | auth | — |
| POST `/payments/:id/status` | auth | — |
| POST `/payments/:id/cancel` | auth | `{ "reason": "customer requested" }` |
| GET `/admin/payments?page=0&size=25&sortBy=createdAt&descending=true` | [Roles: ADMIN] | — |
| POST `/admin/payments/:id/refund` | [Roles: ADMIN] + header `Idempotency-Key` | `{ "reason": "damaged item", "amount": 5000 }` |
| POST `/admin/seller-orders/:sellerOrderId/refund` | [Roles: ADMIN] + `Idempotency-Key` | `{ "reason": "...", "amount": 5000 }` |
| POST `/admin/refunds/:refundId/status` | [Roles: ADMIN] | — |

Gateway webhooks are not verified yet (the gateway's signing scheme is undocumented), so payments settle through reconciliation: `POST /payments/:id/status`, or the background reconciliation sweep when `PAYMENTS_PROVIDER=unified`. Gateway refunds are not supported by the current connectors.

### Financials
| Method & Path | Auth | Body |
|---|---|---|
| GET `/admin/sellers/:id/balance` \| `/ledger` \| `/balance/integrity` | [Roles: ADMIN] | — |
| POST `/admin/sellers/:id/payouts` \| `/payouts/external` | [Roles: ADMIN] + `Idempotency-Key` | `{ "amount": 100000, "reference": "PAYOUT-001", "note": "monthly payout" }` |
| GET `/admin/payouts` | [Roles: ADMIN] | — |
| GET `/sellers/me/balance` \| `/ledger` | approved seller | — |

### Seller payouts
The payout provider is `manual`: approved payouts are batched and then confirmed or failed by an admin once the transfer is made outside the platform.

| Method & Path | Auth | Body |
|---|---|---|
| GET/POST `/sellers/me/payout-accounts` | approved seller | `{ "method": "MOBILE_MONEY", "provider": "MTN", "accountHolderName": "Jane Doe", "destination": { "phoneNumber": "0971234567" } }` (`method`: BANK, MOBILE_MONEY) |
| PATCH `/sellers/me/payout-accounts/:id` | approved seller | create body + `"version": 0` |
| POST `/sellers/me/payout-accounts/:id/disable` | approved seller | `{ "version": 0 }` |
| GET `/sellers/me/payout-requests?status=`, GET `/sellers/me/payout-requests/:id` | approved seller | — |
| POST `/sellers/me/payout-requests` | approved seller + `Idempotency-Key` | `{ "payoutAccountId": "<uuid>", "amount": 50000 }` |
| POST `/sellers/me/payout-requests/:id/cancel` | approved seller + `Idempotency-Key` | `{ "reason": "...", "version": 0 }` |
| GET `/admin/payout-accounts`, GET `/admin/payout-accounts/:id` | [Roles: ADMIN] | — |
| POST `/admin/payout-accounts/:id/verify` | [Roles: ADMIN] | `{ "status": "VERIFIED", "note": "checked", "version": 0 }` |
| GET `/admin/payout-requests?status=&sellerId=`, GET `/admin/payout-requests/:id` | [Roles: ADMIN] | — |
| POST `/admin/payout-requests/:id/approve` \| `/reject` \| `/retry` | [Roles: ADMIN] + `Idempotency-Key` | `{ "reason": "...", "version": 0 }` |
| POST `/admin/payout-requests/:id/resolve` | [Roles: ADMIN] + `Idempotency-Key` | `{ "outcome": "SUCCEEDED", "providerReference": "BANK-REF-1", "note": "...", "version": 0 }` (`outcome`: SUCCEEDED, FAILED) |
| POST `/admin/payout-batches/process` | [Roles: ADMIN] | — batches and submits approved requests now |
| GET `/admin/payout-batches`, GET `/admin/payout-batches/:id` | [Roles: ADMIN] | — |

### Fulfillment — `/admin/fulfillments` `[Roles: STAFF, ADMIN]` (assign/resolve/cancel are `[Roles: ADMIN]` only)
| Method & Path | Body |
|---|---|
| GET `/admin/fulfillments?status=&warehouseId=&assignedUserId=` | — |
| GET `/admin/fulfillments/:id`, `/:id/events` | — |
| POST `/admin/fulfillments/:id/work-items/:type/assign` (`type`=`pick`\|`pack`) | **[Roles: ADMIN]** `{ "assigneeUserId": "<uuid>", "version": 0 }` |
| POST `/admin/fulfillments/:id/picking/start` \| `/packing/start` | `{ "version": 0 }` |
| POST `/admin/fulfillments/:id/picks` \| `/packs` (header `Idempotency-Key`) | `{ "lines": [{ "fulfillmentLineId": "<uuid>", "quantity": 5 }] }` |
| POST `/admin/fulfillments/:id/picking/complete` \| `/packing/complete` | `{ "version": 0 }` |
| POST `/admin/fulfillments/:id/exceptions` | `{ "fulfillmentLineId": "<uuid>", "type": "SHORT_PICK", "quantity": 1, "reason": "damaged in transit" }` |
| POST `/admin/fulfillments/:id/exceptions/:exceptionId/resolve` | **[Roles: ADMIN]** `{ "action": "resume", "resolution": "restocked" }` |
| POST `/admin/fulfillments/:id/dispatches` (header `Idempotency-Key`) | `{ "shipmentId": "<uuid>" }` |
| POST `/admin/fulfillments/:id/cancellations` (header `Idempotency-Key`) | **[Roles: ADMIN]** `{ "lines": [{ "fulfillmentLineId": "<uuid>", "quantity": 1 }], "reason": "customer cancelled" }` |

### Seller fulfillments — `/sellers/me/fulfillments` (approved seller, own fulfillment orders only)
For seller-fulfilled orders (no warehouse). Another seller's fulfillment order is a 404.

| Method & Path | Body |
|---|---|
| POST `/sellers/me/fulfillments/:id/accept` | `{ "version": 0 }` |
| POST `/sellers/me/fulfillments/:id/reject` (header `Idempotency-Key`) | `{ "version": 0, "reason": "out of stock" }` |
| POST `/sellers/me/fulfillments/:id/packs` (header `Idempotency-Key`) | `{ "lines": [{ "fulfillmentLineId": "<uuid>", "quantity": 1 }] }` |
| POST `/sellers/me/fulfillments/:id/cancellations` (header `Idempotency-Key`) | `{ "lines": [{ "fulfillmentLineId": "<uuid>", "quantity": 1 }], "reason": "damaged" }` |
| POST `/sellers/me/fulfillments/:id/dispatches` (header `Idempotency-Key`) | `{ "lines": [{ "fulfillmentLineId": "<uuid>", "quantity": 1 }], "carrierCode": "DHL", "trackingReference": "DHL123", "estimatedDeliveryAt": "2026-10-05T00:00:00Z" }` — creates the shipment and notifies the customer |

### Shipments
| Method & Path | Auth | Body |
|---|---|---|
| GET `/admin/shipments?status=&warehouseId=&fulfillmentOrderId=` | [Roles: STAFF, ADMIN] | — |
| GET `/admin/shipments/:id`, `/:id/tracking-events` | [Roles: STAFF, ADMIN] | — |
| POST `/admin/shipments` (header `Idempotency-Key`) | [Roles: STAFF, ADMIN] | `{ "fulfillmentOrderId": "<uuid>", "lines": [{ "fulfillmentLineId": "<uuid>", "quantity": 1 }] }` |
| POST `/admin/shipments/:id/book` \| `/cancel` | [Roles: STAFF, ADMIN] | cancel: `{ "reason": "..." }` |
| POST `/admin/shipments/:id/tracking-events` | [Roles: STAFF, ADMIN] | `{ "normalizedStatus": "IN_TRANSIT", "description": "Left warehouse", "location": "Lusaka", "occurredAt": "2026-09-17T10:00:00Z" }` |
| GET `/orders/:orderId/shipments` | auth (own order) | — |
| POST `/sellers/me/shipments/:id/tracking-events` (header `Idempotency-Key`) | approved seller (own seller-fulfilled shipment) | `{ "normalizedStatus": "IN_TRANSIT", "description": "...", "location": "Lusaka", "occurredAt": "2026-09-17T10:00:00Z" }` (`normalizedStatus`: IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED) |
| POST `/webhooks/shipping/:providerCode` | [Public] | raw provider JSON — provider-simulated, not typical Swagger testing |

The only carrier is the manual one (`ManualCarrierProvider`). A shipment reaching `DELIVERED`, from any source, sends the customer a "delivered" notification. Tracking corrections (`isCorrection: true`) are ADMIN-only.

### Returns
Customer flow: check eligibility → request → admin approves (assigns a warehouse) → staff post receipts → staff post inspections → admin finalizes, which raises the refund.

| Method & Path | Auth | Body |
|---|---|---|
| GET `/orders/:orderId/return-eligibility` | auth (own order) | — |
| POST `/orders/:orderId/returns` (header `Idempotency-Key`, required) | auth (own order) | `{ "items": [{ "orderItemId": "<uuid>", "quantity": 1, "reasonCode": "DAMAGED", "note": "cracked" }] }` (`reasonCode`: CUSTOMER_REMORSE, WRONG_ITEM, DAMAGED, DEFECTIVE, NOT_AS_DESCRIBED, SIZE_FIT, OTHER) |
| GET `/returns`, GET `/returns/:id` | auth (own returns) | — |
| POST `/returns/:id/cancel` | auth (own return) | `{ "version": 0 }` |
| GET `/sellers/me/returns?status=&dateFrom=&dateTo=&page=&limit=` | approved seller | — returns against the seller's orders |
| POST `/admin/returns` (header `Idempotency-Key`) | [Roles: ADMIN] | `{ "orderId": "<uuid>", "userId": "<uuid>", "items": [...] }` — on the customer's behalf |
| GET `/admin/returns?status=&warehouseId=&assignedStaffId=&dateFrom=&dateTo=&page=&limit=`, GET `/admin/returns/:id` | [Roles: STAFF, ADMIN] | — |
| POST `/admin/returns/:id/approve` | [Roles: ADMIN] | `{ "warehouseId": "<uuid>", "assignedStaffId": "<uuid>", "version": 0 }` |
| POST `/admin/returns/:id/reject` | [Roles: ADMIN] | `{ "rejectionReason": "outside window", "version": 0 }` |
| POST `/admin/returns/:id/receipts` (header `Idempotency-Key`) | [Roles: STAFF, ADMIN] (staff must be the assignee) | `{ "warehouseId": "<uuid>", "lines": [{ "returnItemId": "<uuid>", "quantity": 1 }], "isClosing": false }` — a receipt that brings every item to its requested quantity moves the return to RECEIVED; `isClosing: true` closes it early and releases anything unreceived; `lines: []` is allowed only with `isClosing: true` (closes out a return whose earlier receipts covered what arrived) |
| POST `/admin/returns/:id/inspections` (header `Idempotency-Key`) | [Roles: STAFF, ADMIN] (staff must be the assignee) | `{ "lines": [{ "returnItemId": "<uuid>", "warehouseId": "<uuid>", "acceptedQuantity": 1, "disposition": "RESTOCK", "rejectedQuantity": 0 }], "isFinal": false }` (`disposition`: RESTOCK, QUARANTINE, DAMAGED, DISPOSE; a rejected quantity needs `rejectionReason`). `isFinal: true` (with optional `shippingRefunds`) finalizes in the same call and is **ADMIN-only** |
| POST `/admin/returns/:id/finalize-inspection` | [Roles: ADMIN] | `{ "shippingRefunds": [{ "sellerOrderId": "<uuid>", "amount": 3000 }] }` (optional) — raises the refund case(s) |
| POST `/admin/returns/:id/refund-cases/:refundCaseId/retry` | [Roles: ADMIN] | — |

### Sellers
| Method & Path | Auth | Body |
|---|---|---|
| POST `/sellers/applications` | auth (CUSTOMER) | `{ "businessName": "Jane's Shop", "registrationNumber": "REG-123", "country": "ZM", "businessAddress": "123 Main St, Lusaka", "contactEmail": "jane@shop.test", "documentIds": ["<media-asset-uuid>"] }` (upload docs via `/media` first) |
| GET `/sellers/me` | auth | — |
| POST `/sellers/me/resubmit` | auth | same shape as application |
| GET `/admin/sellers?status=&page=&limit=` | [Roles: ADMIN] | — |
| GET `/admin/sellers/:id` | [Roles: ADMIN] | — |
| GET `/admin/sellers/:id/documents/:documentId/url` | [Roles: ADMIN] | — |
| POST `/admin/sellers/:id/approve` \| `/reject` \| `/suspend` | [Roles: ADMIN] | `{ "version": 0, "reason": "meets requirements" }` |
| GET `/storefronts/:slug` | [Public] | — |
| PUT `/sellers/me/storefront` | [Roles: SELLER] | `{ "version": 0, "storefrontSlug": "janes-shop", "displayName": "Jane's Shop", "description": "Quality goods." }` |
| GET `/sellers/me/reviews` \| `/sellers/me/ratings` | approved seller | — reviews of the seller's products, and ratings of the seller |

### Saved sellers — `/saved-sellers` (auth)
| Method & Path | Body |
|---|---|
| GET `/saved-sellers` | — |
| POST `/saved-sellers` | `{ "sellerId": "<uuid>" }` |
| DELETE `/saved-sellers/:sellerId` | — |

### Reviews
Customers can review a product they received (per order item) and rate a seller (per seller order) once it has been delivered.

| Method & Path | Auth | Body |
|---|---|---|
| GET `/reviews/eligibility?orderId=<uuid>` | auth | — what in that order can be reviewed/rated |
| GET `/reviews/me?page=&limit=` | auth | — |
| POST `/reviews/products` | auth | `{ "orderItemId": "<uuid>", "rating": 5, "title": "Great", "body": "Works well." }` |
| POST `/reviews/sellers` | auth | `{ "sellerOrderId": "<uuid>", "rating": 4, "comment": "Fast shipping" }` |
| PATCH `/reviews/products/:id` \| `/reviews/sellers/:id` (header `Idempotency-Key`) | auth (own review) | `{ "version": 0, "rating": 4, ... }` |
| DELETE `/reviews/products/:id` \| `/reviews/sellers/:id` (header `Idempotency-Key`) | auth (own review) | — withdraws it |
| POST `/reviews/products/:id/reports` \| `/reviews/sellers/:id/reports` (header `Idempotency-Key`) | auth | `{ "reason": "SPAM", "details": "..." }` (`reason`: SPAM, HARASSMENT, HATEFUL_CONTENT, PERSONAL_INFORMATION, OFF_TOPIC, FRAUD, OTHER) |
| GET `/admin/reviews?type=&moderationState=&visibility=&hasOpenReport=&rating=&productId=&sellerId=&page=&limit=` | [Roles: ADMIN] | — |
| GET `/admin/reviews/:type/:id` (`type` = `product` \| `seller`) | [Roles: ADMIN] | — |
| POST `/admin/reviews/:type/:id/approve` (header `Idempotency-Key`) | [Roles: ADMIN] | `{ "version": 0 }` |
| POST `/admin/reviews/:type/:id/hide` \| `/remove` \| `/restore` (header `Idempotency-Key`) | [Roles: ADMIN] | `{ "version": 0, "reason": "..." }` |
| POST `/admin/review-reports/:id/dismiss` | [Roles: ADMIN] | `{ "reason": "not abusive" }` |

### Notifications — `/notifications` (auth)
Created from domain events (order paid, payment failed, order cancelled, new seller order, dispatched, items cancelled, delivered) and also emailed.

| Method & Path | Body |
|---|---|
| GET `/notifications?unread=true&page=&limit=` | — |
| POST `/notifications/:id/read` | — |
| POST `/notifications/read-all` | — |

### Admin operations, analytics and audit
| Method & Path | Auth |
|---|---|
| GET `/admin/operations/metrics?from=&to=` | [Roles: ADMIN] — sales, orders by status, fulfillment, inventory and returns figures for the dashboard |
| GET `/admin/analytics/sales?from=&to=&interval=day&currency=ZMW` | [Roles: STAFF, ADMIN] (`interval`: day, week, month) |
| GET `/admin/audit-events?action=&actorUserId=&targetType=&targetId=&from=&to=&page=&limit=` | [Roles: ADMIN] |
| GET `/admin/audit-events/actions` | [Roles: ADMIN] — the distinct `action` values, for filtering |

### Media — `/media`
| Method & Path | Auth | Body |
|---|---|---|
| POST `/media/uploads` | auth | `{ "fileName": "photo.jpg", "mimeType": "image/jpeg", "byteSize": 102400 }` → returns a signed upload URL/id |
| PUT `/media/:id/content?expires=&signature=` | auth | multipart/form-data file upload (use the signed params from the reserve response) |
| GET `/media/:id/url` | auth | — |
| GET `/media/:id/download?expires=&signature=` | [Public] | — |
| DELETE `/media/:id` | auth | — |

### Health & Metrics — always public
| Method & Path |
|---|
| GET `/health` |
| GET `/health/ready` |
| GET `/metrics` |

---

## 4. Suggested end-to-end test order

1. `POST /auth/login` as admin → Authorize in Swagger.
2. Browse public catalog (`GET /catalog/products`) to grab an existing `offerId`/`variantId` from seed data, or create your own via admin catalog endpoints.
3. Register a customer (`POST /auth/register`), log in as them, add an address, add items to cart, checkout.
4. Register another customer, submit a seller application, switch back to admin to approve it, log in as the new seller to manage offers/inventory.
5. As admin/staff: create a supplier → purchase order → submit → approve → place → receive goods → confirm inventory increased.
6. As admin/staff: pick/pack/dispatch a fulfillment order created by the checkout in step 3, create a shipment, add tracking events up to `DELIVERED`. The customer's `GET /notifications` shows the dispatch and delivery notices.
7. As the customer: review the delivered item (`POST /reviews/products`), then request a return (`POST /orders/:orderId/returns`). As admin: approve it, post a receipt and a final inspection.
8. As admin: view payments/refunds/financials/payouts for the orders created above, and the audit trail at `GET /admin/audit-events`.

## 5. Notes & gotchas

- Amounts (`amount`, `unitCostAmount`, etc.) are always integers in **minor currency units** (e.g. 15000 = 150.00 ZMW).
- Many update endpoints use **optimistic locking** — pass the current `version` from the entity's GET response, or you'll get a 409 conflict.
- `Idempotency-Key` header, when required/accepted, must be a valid UUID v4 — reusing the same key retries safely; a new key is needed per new logical operation.
- The global `ValidationPipe` uses `whitelist + forbidNonWhitelisted` — any extra/misspelled field in a request body causes a 400, not a silent ignore.
- Rate limiting: 100 req/min globally, 5 req/min on auth endpoints (register/login/password-reset) — expect 429s if you spam those in quick succession.
- "Approved seller" routes have no role check at the route; the service requires an APPROVED seller for the caller and returns 404 for another seller's resources.
- Automated coverage: `npm test` (unit), `npm run test:e2e` (in-memory database) and `npm run test:integration` (a real PostgreSQL database named `*_test`, set with `TEST_DATABASE_URL` and `TEST_DATABASE_NAME`; see `docs/backend-development.md`).
