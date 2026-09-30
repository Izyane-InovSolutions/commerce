# Configuration

> Every environment variable the API reads: what it does, its default, and who reads it.

Configuration is validated once, at startup, by [env.validation.ts](../../services/commerce-api/src/infrastructure/config/env.validation.ts) (class-validator, `skipMissingProperties: false`). If a variable is missing or invalid, the process does not start. On top of the per-field checks, `validate()` also enforces:

- Both encryption keyrings must be JSON objects. The active key must be present, every key must be exactly **32 bytes when base64-decoded**, and no key id may contain `:` ([env.validation.ts:290-321](../../services/commerce-api/src/infrastructure/config/env.validation.ts#L290-L321)).
- `SMTP_USER` and `SMTP_PASS` must be set together or left empty together ([env.validation.ts:279-285](../../services/commerce-api/src/infrastructure/config/env.validation.ts#L279-L285)).

When `NODE_ENV=test`, the `.env` file is ignored and only the process environment is used ([app.module.ts:51](../../services/commerce-api/src/app.module.ts#L51)). Test setup files provide those values; see [testing.md](testing.md).

Template: [services/commerce-api/.env.example](../../services/commerce-api/.env.example). It is missing some variables; see [Drift](#drift).

## Core

| Variable              | Default       | Required | Notes                                                                                                                                                  |
| --------------------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`            | `development` | –        | `development` \| `test` \| `production`. `development` and `test` allow HTTP payment gateways. `test` skips the FX refresh at boot and ignores `.env`. |
| `PORT`                | `3000`        | –        | HTTP listen port ([main.ts:60](../../services/commerce-api/src/main.ts#L60)).                                                                          |
| `DATABASE_URL`        | –             | ✔       | `postgres://` or `postgresql://` URL.                                                                                                                  |
| `SHADOW_DATABASE_URL` | –             | ✔       | Prisma shadow database, used by `prisma migrate dev`. Required even at runtime because the schema validates it.                                        |

## Auth and sessions

| Variable                                    | Default             | Required | Notes                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JWT_SECRET`                                | –                   | ✔       | At least 32 characters. Signs access tokens (`auth.module.ts`).                                                                                                                                                                                        |
| `ACCESS_TOKEN_TTL_SECONDS`                  | `900` (15 min)      | –        | Minimum 60.                                                                                                                                                                                                                                            |
| `REFRESH_TOKEN_TTL_SECONDS`                 | `2592000` (30 days) | –        | Minimum 60. Refresh families are also capped at 30 days in code. See [auth-and-access.md](auth-and-access.md).                                                                                                                                         |
| `REFRESH_RECOVERY_ENCRYPTION_ACTIVE_KEY_ID` | –                   | ✔       | Id of the key used to encrypt the 30-second refresh-recovery payload stored on `Session.recoveryData`.                                                                                                                                                 |
| `REFRESH_RECOVERY_ENCRYPTION_KEYS`          | –                   | ✔       | JSON keyring `{"<keyId>":"<base64 32 bytes>"}`. Keep old keys in it after rotating, so existing ciphertext still decrypts.                                                                                                                             |
| `CUSTOMER_WEB_URL`                          | –                   | ✔       | `http(s)` base URL of the storefront. Used to build password-reset and email-verification links (`auth.service.ts`). If it is missing, the API refuses to start; while it was optional, register, resend verification and password reset returned 500. |

## Email

| Variable                                  | Default                             | Required | Notes                                                                                                                                                                 |
| ----------------------------------------- | ----------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SMTP_HOST`                               | –                                   | ✔       | Use mailpit (`deploy/docker-compose.yml`) in dev and testing.                                                                                                         |
| `SMTP_PORT`                               | 465 if `SMTP_SECURE=true`, else 587 | –        | Blank counts as unset. Both mail transports use `smtpPort()` in `env.validation.ts`. The API refuses to start on `587` with `SMTP_SECURE=true`, which never connects. |
| `SMTP_SECURE`                             | `false`                             | –        | The string `true` or `false`. `true` means implicit TLS (port 465); use `false` for STARTTLS on 587.                                                                  |
| `SMTP_USER` / `SMTP_PASS`                 | empty                               | –        | Both or neither. With neither set, no SMTP auth is attempted.                                                                                                         |
| `EMAIL_FROM`                              | –                                   | ✔       | Sender address ([smtp-email.sender.ts](../../services/commerce-api/src/infrastructure/email/smtp-email.sender.ts)).                                                   |
| `SMTP_CONNECTION_TIMEOUT_MS`              | `10000`                             | –        | 1000–60000. Also used as the greeting timeout.                                                                                                                        |
| `SMTP_SEND_TIMEOUT_MS`                    | `30000`                             | –        | 1000–120000. Socket timeout.                                                                                                                                          |
| `EMAIL_DELIVERY_ENCRYPTION_ACTIVE_KEY_ID` | –                                   | ✔       | Key for the template variables stored on `EmailDelivery` rows until they are sent.                                                                                    |
| `EMAIL_DELIVERY_ENCRYPTION_KEYS`          | –                                   | ✔       | JSON keyring, same format as above.                                                                                                                                   |

## Media storage

| Variable                       | Default             | Required | Notes                                                                     |
| ------------------------------ | ------------------- | -------- | ------------------------------------------------------------------------- |
| `MEDIA_STORAGE_PATH`           | `.data/media`       | –        | Local directory used by `LocalStorageProvider`. It is a volume in Docker. |
| `MEDIA_SIGNING_SECRET`         | –                   | ✔       | At least 32 characters. HMAC key for signed upload and download URLs.     |
| `MEDIA_MAX_FILE_SIZE_BYTES`    | `10485760` (10 MiB) | –        |                                                                           |
| `MEDIA_URL_TTL_SECONDS`        | `900`               | –        | TTL of general signed URLs.                                               |
| `MEDIA_PUBLIC_URL_TTL_SECONDS` | `86400`             | –        | TTL of product image URLs embedded in cached catalog responses.           |

## Payments

| Variable                         | Default   | Required       | Notes                                                                                                                                                                                                                     |
| -------------------------------- | --------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAYMENTS_PROVIDER`              | `pending` | –              | `pending` gives `PendingPaymentProvider`, where every payment call returns 503. `unified` gives the Unified Payments gateway ([payments.module.ts](../../services/commerce-api/src/modules/payments/payments.module.ts)). |
| `UNIFIED_PAYMENTS_BASE_URL`      | –         | when `unified` | Origin only: no path, query, hash or credentials. It must be `https:` unless HTTP is allowed (next row).                                                                                                                  |
| `UNIFIED_PAYMENTS_ALLOW_HTTP`    | –         | –              | **Not in the schema.** It is read raw by `UnifiedPaymentProvider`. `true` allows an `http:` gateway outside dev and test.                                                                                                 |
| `UNIFIED_PAYMENTS_API_KEY`       | –         | when `unified` | Sent as `X-API-Key`. Redacted from logs and audit metadata.                                                                                                                                                               |
| `UNIFIED_PAYMENTS_MERCHANT_ID`   | empty     | –              | Sent as `merchantId` only when it is set.                                                                                                                                                                                 |
| `UNIFIED_PAYMENTS_CARD_CURRENCY` | `USD`     | –              | The currency card charges settle in. Only `USD` or `GBP` works; anything else makes card payments return 503.                                                                                                             |
| `UNIFIED_PAYMENTS_CALLBACK_URL`  | –         | –              | Only sent to the gateway when it is set. Webhooks cannot be verified yet; see [integrations.md](integrations.md#payments).                                                                                                |
| `UNIFIED_PAYMENTS_TIMEOUT_MS`    | `15000`   | –              | 1000–60000. Timeout for each gateway call. A timeout is treated as an unknown outcome, never as a failure.                                                                                                                |

## FX rates

| Variable                   | Default | Required | Notes                                                                                                                                                                                                                                                                                             |
| -------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAYMENT_FX_API_KEY`       | –       | –        | exchangerate-api.com key. When it is unset, rates are never fetched and only `PAYMENT_FX_QUOTES` is used.                                                                                                                                                                                         |
| `PAYMENT_FX_BASE_CURRENCY` | `ZMW`   | –        | Base currency of the fetched rates.                                                                                                                                                                                                                                                               |
| `PAYMENT_FX_QUOTES`        | `{}`    | –        | Manual fallback quotes, e.g. `{"USD":{"rate":"0.0370","quoteId":"manual-1","expiresAt":"2026-10-31T00:00:00Z"}}`. `rate` is target major units per 1 ZMW, as a decimal string. If a quote is malformed or expired, foreign settlement is disabled for that request (503); startup still succeeds. |

## Marketplace and payouts

| Variable                      | Default      | Required | Notes                                                                                                                                |
| ----------------------------- | ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `MARKETPLACE_COMMISSION_BPS`  | `1000` (10%) | –        | 0–10000. One commission rate for the whole platform, applied in `LedgerService.recordSale`.                                          |
| `SELLER_PAYOUT_HOLD_DAYS`     | `0`          | –        | How long sale proceeds stay in `heldBalance` before they can be withdrawn. `0` releases them immediately.                            |
| `SELLER_PAYOUT_MINIMUM_MINOR` | `1`          | –        | Smallest payout request allowed.                                                                                                     |
| `SELLER_PAYOUT_PROVIDER`      | `manual`     | –        | The only allowed value is `manual`. It is validated but **never read**: the payout provider is hard-wired to `ManualPayoutProvider`. |

## Shipping

| Variable                                 | Default | Required | Notes                                                                  |
| ---------------------------------------- | ------- | -------- | ---------------------------------------------------------------------- |
| `SHIPPING_DOMESTIC_COUNTRY`              | `ZM`    | –        | ISO-2 code. A destination in this country gets the domestic rate.      |
| `SHIPPING_DOMESTIC_RATE_MINOR`           | `3000`  | –        | Flat domestic rate per seller shipping group.                          |
| `SHIPPING_DOMESTIC_FREE_THRESHOLD_MINOR` | `50000` | –        | Domestic shipping is free when the group subtotal is at or above this. |
| `SHIPPING_INTERNATIONAL_RATE_MINOR`      | `15000` | –        | Flat rate for every other country.                                     |
| `SHIPPING_UNSUPPORTED_COUNTRIES`         | empty   | –        | Comma-separated ISO-2 codes that cannot be shipped to.                 |
| `SHIPPING_QUOTE_TTL_SECONDS`             | `3600`  | –        | How long a quote stays valid.                                          |

## Variables outside the schema

| Variable                                                 | Read by                                                                                                        | Notes                                                                                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SCHEDULED_WORKERS_ENABLED`                              | [jobs.module.ts:12-14](../../services/commerce-api/src/infrastructure/jobs/jobs.module.ts#L12-L14)             | Only the string `false` turns scheduling off. Then **every** `@Interval` task stops, including the job worker poll, so queued jobs are not processed either. Not validated.      |
| `UNIFIED_PAYMENTS_ALLOW_HTTP`                            | `unified-payment.provider.ts`                                                                                  | See Payments above.                                                                                                                                                              |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`                | `prisma/seed.ts`                                                                                               | Admin account created by `npm run prisma:seed`.                                                                                                                                  |
| `TEST_DATABASE_URL`, `TEST_DATABASE_NAME`                | [integration-test.config.ts](../../services/commerce-api/src/infrastructure/config/integration-test.config.ts) | Integration tests only. The database name must end in `_test`.                                                                                                                   |
| `INTEGRATION_DATABASE_MODE`, `INTEGRATION_DATABASE_NAME` | same                                                                                                           | `disposable-development` runs the integration tests against `DATABASE_URL`. Allowed only on a loopback host, never with `NODE_ENV=production`, and the database name must match. |

## Generating keys

```bash
# 32-byte base64 key for a keyring entry
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Keyring value
REFRESH_RECOVERY_ENCRYPTION_ACTIVE_KEY_ID=v1
REFRESH_RECOVERY_ENCRYPTION_KEYS={"v1":"<key>"}
```

To rotate a key, add `v2` to the JSON, point `*_ACTIVE_KEY_ID` at `v2`, and keep `v1` until nothing encrypted with it is still stored. Recovery data lives for 30 seconds and email payloads for at most 24 hours. The ciphertext is bound to its record (for example `email-delivery:<id>`), so it cannot be copied to a different row and decrypted there ([field-encryption.util.ts](../../services/commerce-api/src/common/crypto/field-encryption.util.ts)).

## Drift

These variables are validated or read but **missing from `.env.example`**:

- `PAYMENT_FX_API_KEY`
- `PAYMENT_FX_BASE_CURRENCY`
- `SELLER_PAYOUT_HOLD_DAYS`
- `SELLER_PAYOUT_MINIMUM_MINOR`
- `SELLER_PAYOUT_PROVIDER`
- `UNIFIED_PAYMENTS_ALLOW_HTTP`
- `SCHEDULED_WORKERS_ENABLED`
