# Unified Payments integration

The NestJS payments module calls the external API through `UnifiedPaymentProvider`.
The API key stays on the backend. No external payment requests are made by tests.

## Routes

All routes below use the `/api/v1` prefix and require a bearer access token.
Payment `:id` parameters are **local payment UUIDs** returned by checkout. The backend
resolves the corresponding external `pay_...` ID; a merchant name is never a payment ID.

| Local route | Access | External request |
| --- | --- | --- |
| `POST /checkout` | Customer | `POST /api/v1/payments` after creating an order |
| `GET /payments/:id` | Payment owner | `GET /api/v1/payments/{paymentId}` |
| `POST /payments/:id/status` | Payment owner | `POST /api/v1/payments/{paymentId}/status` |
| `POST /payments/:id/cancel` | Payment owner | `POST /api/v1/payments/{paymentId}/cancel` |
| `GET /admin/payments` | Active admin | `GET /api/v1/payments` |
| `POST /admin/payments/:id/refund` | Active admin | `POST /api/v1/payments/{paymentId}/refund` |

Listing accepts `page=0&size=25&sortBy=createdAt&descending=true` (maximum size 100).
Cancellation accepts `{ "reason": "Customer request" }`.
Refund accepts `{ "amount": 100, "reason": "Customer request" }` and requires an
`Idempotency-Key` header containing a UUID v4. Reuse the same key for the same request.
The local refund amount is in **minor units**: 100 means 1.00 at the gateway.
Refunds require a locally confirmed payment. Current connectors report
`OPERATION_NOT_SUPPORTED`, surfaced as HTTP 501; no local refund is marked completed.

## Checkout

Supply the existing shipping address UUID and payment details:

```json
{
  "shippingAddressId": "YOUR-SHIPPING-ADDRESS-UUID",
  "paymentDetails": {
    "paymentMethod": "MOBILE_MONEY",
    "phoneNumber": "0970000000",
    "provider": "AIRTEL"
  }
}
```

The order determines amount, currency, and reference; clients cannot override them.
Commerce prices are integer minor units and are divided by 100 for this gateway.
Mobile money requires ZMW; supported provider selections are AIRTEL and MTN.
For CARD use USD or GBP and the documented `card` object (including billing),
without phoneNumber/provider. Swagger describes the nested card fields.
Card details are sent transiently, excluded from structured logs, and never saved
to Prisma. No callback URL is sent until callback verification is documented.

## Configuration

The default `PAYMENTS_PROVIDER=pending` retains the existing placeholder behavior.
To select the external adapter, configure these values in the API's local `.env`:

```ini
PAYMENTS_PROVIDER=unified
UNIFIED_PAYMENTS_BASE_URL=https://YOUR-PROVIDER-HOST
UNIFIED_PAYMENTS_API_KEY=YOUR-REPLACEMENT-KEY
UNIFIED_PAYMENTS_MERCHANT_ID=KAUSA
UNIFIED_PAYMENTS_TIMEOUT_MS=15000
```

The base URL is an HTTPS origin, without `/api/v1`, credentials, or query parameters.
The supplied HTTP address cannot be used with this adapter. Obtain the provider's
HTTPS address before enabling it. Credentials from chat have not been added to files.
Restart the API after changing environment values. No new database migration is
required for these payment adapter changes.

## Lifecycle limitations

Only PENDING has been confirmed in the supplied response contract. External states
are exposed as `gateway.status` (and `gatewayStatus` in checkout), but are not guessed
into local paid, failed, cancelled, or refunded states. Get/status/cancel responses
do not currently change order or inventory state. Non-PENDING states return
`requiresReconciliation: true`.

A timeout, malformed response, or failure to save an accepted response leaves the
local payment pending and returns `requiresReconciliation: true`. Do not initiate a
new checkout to retry that charge. Use the existing external ID or have an admin
find the gateway payment by the order UUID reference. Recovery when the external ID
could not be saved requires manual reconciliation; no recovery endpoint is provided.
A cart-clear failure after initialization does not cancel an accepted payment.

Before using real payments, obtain the full payment status enum and transition
contract and implement verified reconciliation with order/inventory updates,
including reservation expiry coordination. Webhooks remain unavailable for this
provider until the payload and signature verification contract are supplied.
Cancellation is provider-dependent; unsupported operations return HTTP 501.
The successful refund response contract is also needed when a connector adds refunds.

Run `npm run start:dev` and open `http://localhost:3000/api/docs` to inspect the routes
(use your configured PORT if different).
All automated gateway tests mock HTTP; they do not prove connectivity to the live provider.
