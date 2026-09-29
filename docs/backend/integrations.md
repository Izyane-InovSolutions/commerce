# Integrations

> Every external dependency sits behind an interface (a "seam") that is bound to one adapter. This page covers each seam, the adapter used today, and how finished that adapter is.

## Summary

| Seam           | Token / interface                                                                                                               | Adapter today                                                                                 | Status                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Payments       | `PAYMENT_PROVIDER` / [`PaymentProvider`](../../services/commerce-api/src/modules/payments/payment-provider.ts)                  | `UnifiedPaymentProvider` when `PAYMENTS_PROVIDER=unified`, otherwise `PendingPaymentProvider` | Live for charges (mobile money and card). **No webhooks, no refunds.** |
| FX rates       | `FX_RATE_PROVIDER` / `FxRateProvider`                                                                                           | `ExchangeRateApiProvider` (exchangerate-api.com), with the `PAYMENT_FX_QUOTES` fallback       | Live when `PAYMENT_FX_API_KEY` is set                                  |
| Email          | `EMAIL_SENDER` / [`EmailSender`](../../services/commerce-api/src/infrastructure/email/email-sender.interface.ts)                | `SmtpEmailSender` (nodemailer)                                                                | Live                                                                   |
| File storage   | `STORAGE_PROVIDER` / [`StorageProvider`](../../services/commerce-api/src/infrastructure/storage/storage-provider.ts)            | `LocalStorageProvider` (filesystem)                                                           | Live, single node only                                                 |
| Shipping rates | `SHIPPING_RATE_PROVIDER` / [`ShippingRateProvider`](../../services/commerce-api/src/modules/shipping/shipping-rate.provider.ts) | `ZoneShippingRateProvider`                                                                    | Flat zone rates from env                                               |
| Carriers       | `CARRIER_PROVIDERS` / [`CarrierProvider`](../../services/commerce-api/src/modules/shipments/carrier-provider.interface.ts)      | `ManualCarrierProvider`                                                                       | Manual: booking works, polling returns nothing, no webhooks            |
| Seller payouts | `PAYOUT_PROVIDER` / [`PayoutProvider`](../../services/commerce-api/src/modules/financials/payouts/payout-provider.ts)           | `ManualPayoutProvider`                                                                        | Manual: every payout needs an admin to resolve it                      |

To add an integration, implement the interface and bind it in the owning module. Nothing outside the seam should need to change.

## Payments

### The seam

`PaymentProvider` ([payment-provider.ts](../../services/commerce-api/src/modules/payments/payment-provider.ts)):

| Method                              | Purpose                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepareInput?(input)`              | Optional. Rewrites the request before it is persisted, for example converting a ZMW card charge to its settlement currency and returning the `settlement` quote to store. |
| `validateInput?(input)`             | Optional. Rejects bad payment details before the order is created.                                                                                                        |
| `initialize(input)`                 | Starts the charge. Returns `providerReference`, `status` and the raw `gatewayStatus`.                                                                                     |
| `getPayment(ref)`                   | Reads the provider's view of a payment, for reconciliation.                                                                                                               |
| `verifyWebhook(rawBody, signature)` | Authenticates a callback and turns it into a `VerifiedPaymentEvent`.                                                                                                      |
| `refund(...)` / `getRefund(ref)`    | Refund, and refund lookup.                                                                                                                                                |

Normalised statuses: `PENDING`, `REQUIRES_ACTION`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `CANCELLED`.

The adapter is chosen by `resolvePaymentProvider` ([payments.module.ts:26-34](../../services/commerce-api/src/modules/payments/payments.module.ts#L26-L34)). `PendingPaymentProvider` (`name = 'pending-integration'`) returns 503 for every call. It is the safe default, so checkout cannot take money before a gateway is configured.

### Unified Payments gateway

[unified-payment.provider.ts](../../services/commerce-api/src/modules/payments/unified-payment.provider.ts), `name = 'unified'`.

**Connection.** Needs `PAYMENTS_PROVIDER=unified`, `UNIFIED_PAYMENTS_API_KEY` and `UNIFIED_PAYMENTS_BASE_URL`. If any is missing, calls return 503.

- The base URL must be a bare origin: no path, query, hash or credentials.
- It must be `https:`. `http:` is accepted only when `NODE_ENV` is `development` or `test`, or when `UNIFIED_PAYMENTS_ALLOW_HTTP=true` ([unified-payment.provider.ts:393-410](../../services/commerce-api/src/modules/payments/unified-payment.provider.ts#L393-L410)).
- Every call sends `X-API-Key` and uses `redirect: 'error'` and a timeout of `UNIFIED_PAYMENTS_TIMEOUT_MS`. It sends `Idempotency-Key` when there is one; the charge uses the local payment's key.

**Calls made.**

| Gateway call                                           | Used for                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `POST /api/v1/payments`                                | Starting a charge (`initialize`)                                                       |
| `GET /api/v1/payments/{id}`                            | `getPayment` and `getDetails`; no side effects                                         |
| `POST /api/v1/payments/{id}/status`                    | Status check (customer `POST /payments/:id/status`)                                    |
| `POST /api/v1/payments/{id}/cancel`                    | Cancel (customer `POST /payments/:id/cancel`)                                          |
| `POST /api/v1/payments/{id}/refund`                    | Wrapped by `requestRefund`, but the platform's refund flow does not call it (see gaps) |
| `GET /api/v1/payments?page=&size=&sortBy=&descending=` | Admin list (`GET /admin/payments`)                                                     |

**Request body for a charge.**

- Always sent: `amount` (major units, i.e. the minor-unit value ÷ 100), `currency`, `reference` (the order id) and `paymentMethod`.
- Mobile money adds `phoneNumber` and an optional `provider` (`AIRTEL` or `MTN`). Card adds `card` with billing details.
- Sent only when non-empty: `merchantId`, `description`, `callbackUrl`, `metadata`.

Card details pass through and are never stored. `redact()` masks `card`, `phoneNumber` and `paymentDetails` in logs and audit metadata.

**Payment-method rules** (`validateInput` with [PaymentDetailsDto](../../services/commerce-api/src/modules/payments/dto/payment-details.dto.ts)):

- **Mobile money**
  - Requires ZMW.
  - The phone number must match `^(?:0|\+?260)[579]\d{8}$`, i.e. Zambian 09x, 07x or 05x numbers.
  - Must not include card fields.
- **Card**
  - The order is priced in ZMW. `prepareInput` converts it with `PaymentCurrencyConverter` into `UNIFIED_PAYMENTS_CARD_CURRENCY` (USD or GBP) and the settlement quote is stored with the payment.
  - The card details must include the full billing block.
  - Must not include mobile-money fields.

**Response handling.**

- **Envelope.** The response must be `{ success: true, data }`. `success: false` with error code `OPERATION_NOT_SUPPORTED` becomes 501, `PAYMENT_NOT_FOUND` becomes 404, and any other 4xx becomes 400.
- **Unknown outcome.** Anything else, including timeouts, bad JSON and malformed data, raises `PaymentOutcomeUnknownException`. The local payment is then kept and flagged for reconciliation. It is never marked as failed, so stock is not released for a charge that may have gone through.
- **Status mapping.** Only statuses seen on real payments are mapped: `SUCCESS` → `SUCCEEDED` and `FAILED` → `FAILED`. Any other status, including `PENDING`, maps to `PENDING` and never to a success or failure ([unified-payment.provider.ts:53-61](../../services/commerce-api/src/modules/payments/unified-payment.provider.ts#L53-L61)).
- **Service charge.** The gateway may report the order's own figure as `requestedAmount` and the fee-inclusive total as `amount`. The parser keeps `requestedAmount` as `amount` and records `serviceCharge` separately. It rejects a total lower than the requested amount, or a malformed breakdown, as an unknown outcome ([unified-payment.provider.ts:318-340](../../services/commerce-api/src/modules/payments/unified-payment.provider.ts#L318-L340)).
- **Consistency check.** After a charge, the returned `reference`, `currency` and amount must match what was sent. Reconciliation (`PaymentsService`, `GatewayPaymentsService`) checks the same fields against the stored settlement or order and returns 409 on a mismatch.
- **Correlation id.** The gateway's `correlationId` is logged for each call so problems can be traced with them.

**Webhooks.**

- `POST /api/v1/payments/webhook` is public, reads the raw body and the `x-webhook-signature` header, and calls `verifyWebhook`.
- The gateway's signing scheme is not documented, so `UnifiedPaymentProvider.verifyWebhook` throws 501. **Every callback is rejected.**
- `callbackUrl` is only sent when `UNIFIED_PAYMENTS_CALLBACK_URL` is set.
- Until signing is in place, payments settle in one of two ways:
  1. the synchronous result at checkout, or
  2. a status check, `POST /api/v1/payments/:id/status`, which asks the gateway and applies the result.

**Refunds.**

- `UnifiedPaymentProvider.refund()` and `getRefund()` both return 501.
- Refund cases (see [modules/payments.md](modules/payments.md)) record the refund obligation and its attempts. They end in `FAILED` or `RECONCILIATION_REQUIRED` until a refund result contract is agreed with the gateway.

**Identity lookup (not integrated).** The gateway also offers `POST /api/v1/identity/mobile-money`, which checks whether a number is registered and returns `confirmed`, `accountName` and `nameMatches`. Nothing in the codebase calls it yet. The natural place to use it is when a seller adds or changes a payout destination.

## FX rates

- `FxRatesService` loads the `FxRate` table into memory at boot ([fx-rates.service.ts](../../services/commerce-api/src/modules/payments/fx-rates.service.ts)). `FxRatesRefreshScheduler` then refreshes the rates every hour, and once at boot unless `NODE_ENV=test`.
- Each refresh makes one call to `https://v6.exchangerate-api.com/v6/<key>/latest/<PAYMENT_FX_BASE_CURRENCY>`, with a 10 s timeout ([exchange-rate-api.provider.ts](../../services/commerce-api/src/modules/payments/exchange-rate-api.provider.ts)). Rates are stored as 8-decimal strings.
- A fetched rate expires after **2 refresh intervals**, so one failed refresh does not stop card payments.
- `PaymentCurrencyConverter.quote(amount, currency)` ([payment-currency-converter.ts](../../services/commerce-api/src/modules/payments/payment-currency-converter.ts)):
  - It prefers the live cache and falls back to `PAYMENT_FX_QUOTES`.
  - The arithmetic uses BigInt integers and rounds half-up once, at the target currency's minor unit.
  - It never accepts a rate or a converted amount from the client.
  - If the rate is missing, expired or out of range, it returns 503 "This payment method is temporarily unavailable".
- Without `PAYMENT_FX_API_KEY`, no request is ever made.

## Email

- **Sending.** `SmtpEmailSender` ([smtp-email.sender.ts](../../services/commerce-api/src/infrastructure/email/smtp-email.sender.ts)) wraps nodemailer. It uses SMTP auth only when both the user and password are set, and applies connection, greeting and socket timeouts.
- **Queueing.** Emails go through the encrypted `EmailDelivery` table and the `email.send` job. See [background-processing.md](background-processing.md#email-delivery-pipeline).
- **Templates.** `password-reset`, `password-changed` and `email-verification`. Links in them point at `CUSTOMER_WEB_URL`.
- **Dev and testing.** Use mailpit, as in `deploy/docker-compose.yml`, with `SMTP_HOST=mailpit` and `SMTP_PORT=1025`.

## File storage

- **Adapter.** `LocalStorageProvider` ([local-storage.provider.ts](../../services/commerce-api/src/infrastructure/storage/local-storage.provider.ts)) writes each object to `MEDIA_STORAGE_PATH/<key>`, with a `<key>.mime` sidecar file holding its MIME type.
- **Safety.** Keys are resolved inside the root directory, and any path that escapes it is rejected.
- **Downloads.** They are signed with HMAC, see [modules/media.md](modules/media.md).
- **Limits.** The adapter only works while every replica shares one disk (the `media` volume). Running several nodes needs an object-storage adapter implementing `put`, `get` and `delete`.

## Shipping rates

- `ZoneShippingRateProvider` quotes a price for each seller shipping group:
  - A domestic destination (`SHIPPING_DOMESTIC_COUNTRY`) pays a flat rate, which is free at or above the subtotal threshold.
  - Every other country pays a flat international rate.
  - Countries in `SHIPPING_UNSUPPORTED_COUNTRIES` are refused.
- Every quote has `providerCode: 'ZONE'` and `carrierCode: 'MANUAL'`.
- The `providerCode` on the quote decides which `CarrierProvider` books the shipment later.
- See [modules/shipping.md](modules/shipping.md).

## Carriers

- **The seam.** `CarrierProvider` has `book`, `cancel`, `poll`, and an optional `parseWebhook`. Adapters are found by `providerCode` in `CarrierProviderRegistry`.
- **Today's adapter.** `ManualCarrierProvider` returns a tracking reference, cancels without calling out, and `poll()` returns `[]`. Status changes are posted by hand by admins, or by sellers for their own shipments.
- **Webhook endpoint.** `POST /api/v1/webhooks/shipping/:providerCode` is public. Duplicate deliveries are dropped using `CarrierWebhookDelivery` (the provider's delivery id, or a hash of the payload). **Signatures are not checked.** See [modules/shipments.md](modules/shipments.md).

## Seller payouts

- **The seam.** `PayoutProvider.submit({ requestId, attemptId, idempotencyKey, amount, currency, destination })` returns `SUCCEEDED`, `FAILED` or `RECONCILIATION_REQUIRED`.
- **Today's adapter.** `ManualPayoutProvider` always returns `RECONCILIATION_REQUIRED` with reference `manual:<attemptId>` ([manual-payout.provider.ts](../../services/commerce-api/src/modules/financials/payouts/manual-payout.provider.ts)). The money is sent outside the platform, and an admin then marks each request as succeeded or failed with `POST /admin/payout-requests/:id/resolve`.
- **Config.** `SELLER_PAYOUT_PROVIDER` is validated, but no code uses it to choose an adapter.
- See [modules/financials.md](modules/financials.md).
