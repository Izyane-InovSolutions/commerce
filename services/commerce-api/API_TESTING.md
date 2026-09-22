# API Testing Guide (Swagger)

Everything you need to exercise every endpoint in `commerce-api` via Swagger UI.

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
Several mutating endpoints (checkout, refunds, fulfillment work, shipment creation) accept/require an `Idempotency-Key` header. Use any UUID v4, e.g. generate one per request in Swagger's header field.

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
| POST `/auth/password-reset/request` | [Public] | `{ "email": "user@test.com" }` — token isn't emailed; check DB `PasswordResetToken` table for the raw value when testing |
| POST `/auth/password-reset/confirm` | [Public] | `{ "token": "<from DB>", "newPassword": "NewPassw0rd!" }` |
| GET `/auth/sessions` | auth | — |
| DELETE `/auth/sessions/:id` | auth | — (`id` = session UUID) |

### Users — `/users`
| Method & Path | Auth | Body |
|---|---|---|
| GET `/users/me` | auth | — |
| PATCH `/users/me` | auth | `{ "firstName": "Jane", "lastName": "Doe", "phone": "+260971234567" }` (all optional) |

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
| GET `/catalog/variants/:id/offers` | [Public] |
| GET `/catalog/offers/:id` | [Public] |
| GET `/storefronts/:slug/offers` | [Public] |

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
| GET `/admin/catalog/offers/:id` | [Roles: STAFF, ADMIN] | — |
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
| POST `/admin/inventory/adjust` | [Roles: STAFF, ADMIN] | `{ "warehouseId": "<uuid>", "variantId": "<uuid>", "delta": -5, "note": "damage" }` |
| GET `/admin/inventory/:id/movements` \| `/reservations` | [Roles: STAFF, ADMIN] | — |
| GET `/sellers/me/inventory` | [Roles: SELLER] | — |
| PUT `/sellers/me/inventory/:offerId` | [Roles: SELLER] | `{ "quantity": 20, "version": 0, "note": "restock" }` |
| PATCH `/sellers/me/inventory/bulk` | [Roles: SELLER] | `{ "items": [{ "offerId": "<uuid>", "quantity": 20, "version": 0 }] }` |
| GET `/sellers/me/inventory/:offerId/movements` | [Roles: SELLER] | — |
| GET/POST/PATCH/DELETE `/admin/inventory/warehouses(/:id)` | [Roles: STAFF, ADMIN] | Create: `{ "name": "Main WH", "code": "MAIN-01" }` |

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
> Note: with the default `.env` (`PAYMENTS_PROVIDER=pending`), real charges are stubbed/refused by design — checkout order creation still works, but payment capture won't succeed until `PAYMENTS_PROVIDER=unified` is configured.

### Orders
| Method & Path | Auth | Body |
|---|---|---|
| GET `/orders`, GET `/orders/:id` | auth (own orders) | — |
| GET `/admin/orders?status=&page=&limit=`, GET `/admin/orders/:id` | [Roles: STAFF, ADMIN] | — |
| GET `/sellers/me/orders`, GET `/sellers/me/orders/:id` | [Roles: SELLER] | — |

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

### Financials
| Method & Path | Auth | Body |
|---|---|---|
| GET `/admin/sellers/:id/balance` \| `/ledger` | [Roles: ADMIN] | — |
| POST `/admin/sellers/:id/payouts` | [Roles: ADMIN] | `{ "amount": 100000, "reference": "PAYOUT-001", "note": "monthly payout" }` |
| GET `/admin/payouts` | [Roles: ADMIN] | — |
| GET `/sellers/me/balance` \| `/ledger` | [Roles: SELLER] (must be an APPROVED seller) | — |

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

### Shipments
| Method & Path | Auth | Body |
|---|---|---|
| GET `/admin/shipments?status=&warehouseId=&fulfillmentOrderId=` | [Roles: STAFF, ADMIN] | — |
| GET `/admin/shipments/:id`, `/:id/tracking-events` | [Roles: STAFF, ADMIN] | — |
| POST `/admin/shipments` (header `Idempotency-Key`) | [Roles: STAFF, ADMIN] | `{ "fulfillmentOrderId": "<uuid>", "lines": [{ "fulfillmentLineId": "<uuid>", "quantity": 1 }] }` |
| POST `/admin/shipments/:id/book` \| `/cancel` | [Roles: STAFF, ADMIN] | cancel: `{ "reason": "..." }` |
| POST `/admin/shipments/:id/tracking-events` | [Roles: STAFF, ADMIN] | `{ "normalizedStatus": "IN_TRANSIT", "description": "Left warehouse", "location": "Lusaka", "occurredAt": "2026-09-17T10:00:00Z" }` |
| GET `/orders/:orderId/shipments` | auth (own order) | — |
| POST `/webhooks/shipping/:providerCode` | [Public] | raw provider JSON — provider-simulated, not typical Swagger testing |

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
6. As admin/staff: pick/pack/dispatch a fulfillment order created by the checkout in step 3, create a shipment, add tracking events.
7. As admin: view payments/refunds/financials/payouts for the orders created above.

## 5. Notes & gotchas

- Amounts (`amount`, `unitCostAmount`, etc.) are always integers in **minor currency units** (e.g. 15000 = 150.00 ZMW).
- Many update endpoints use **optimistic locking** — pass the current `version` from the entity's GET response, or you'll get a 409 conflict.
- `Idempotency-Key` header, when required/accepted, must be a valid UUID v4 — reusing the same key retries safely; a new key is needed per new logical operation.
- The global `ValidationPipe` uses `whitelist + forbidNonWhitelisted` — any extra/misspelled field in a request body causes a 400, not a silent ignore.
- Rate limiting: 100 req/min globally, 5 req/min on auth endpoints (register/login/password-reset) — expect 429s if you spam those in quick succession.
