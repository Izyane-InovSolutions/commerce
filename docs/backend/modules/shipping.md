# Shipping

> Checkout-time shipping quotes. Items are grouped by fulfillment mode, and a pluggable `ShippingRateProvider` prices each group. Today that provider is a configurable domestic/international zone policy.

## Purpose and features

- **Checkout** (orders module) calls `ShippingService.quoteSellerGroups` once per seller group. It does this both for the preview quote and when creating the order, so the two cannot drift ([orders.service.ts:333](../../../services/commerce-api/src/modules/orders/orders.service.ts#L333)).
- Within a seller, items are split into one shipping group per `OfferFulfillmentMode` (PLATFORM / SELLER). Each group gets one rate quote, carrying the carrier identity that later shipment booking must use ([shipments.md](shipments.md)).
- `ZoneShippingRateProvider` charges a flat domestic rate, with free shipping above a threshold, or a flat international rate. Destinations on a configured list are refused.
- There is no HTTP surface and no persistence here. The orders module stores the returned quote fields on `ShippingGroup`.

## Routes

None. The module has no controllers ([shipping.module.ts:7](../../../services/commerce-api/src/modules/shipping/shipping.module.ts#L7)).

| Method | Path | Access | Idempotency | Description |
| ------ | ---- | ------ | ----------- | ----------- |
| –      | –    | –      | –           | No routes   |

## Services

| Service                                                                                                                                           | Responsibility                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ShippingService` ([shipping.service.ts](../../../services/commerce-api/src/modules/shipping/shipping.service.ts))                                | `quoteSellerGroups(sellerId, items, destinationCountry, currency)` -> `ShippingQuoteGroup[]` ([:40](../../../services/commerce-api/src/modules/shipping/shipping.service.ts#L40)). Exported. |
| `ZoneShippingRateProvider` ([zone-shipping-rate.provider.ts](../../../services/commerce-api/src/modules/shipping/zone-shipping-rate.provider.ts)) | The only `ShippingRateProvider`. Bound to `SHIPPING_RATE_PROVIDER` with `useExisting` ([shipping.module.ts:10](../../../services/commerce-api/src/modules/shipping/shipping.module.ts#L10)). |

`ShippingRateProvider` contract ([shipping-rate.provider.ts:35](../../../services/commerce-api/src/modules/shipping/shipping-rate.provider.ts#L35)):

- **Input:** `quote({ sellerId, fulfillmentMode, destinationCountry, currency, subtotal, quantity })`.
- **Output:** `{ serviceLevel, rateCode, amount, quoteId, estimatedDeliveryDays{min,max}, expiresAt, providerCode, carrierCode, methodCode, methodName }`.
- `providerCode` selects the `CarrierProvider` at booking time. `methodCode` is the provider's rate id ([shipping-rate.provider.ts:23](../../../services/commerce-api/src/modules/shipping/shipping-rate.provider.ts#L23)).

## Business rules

### ShippingService

- **Currency.** Every item must have a `unitPrice` in the checkout currency, else 400 ([shipping.service.ts:48](../../../services/commerce-api/src/modules/shipping/shipping.service.ts#L48)).
- **Grouping.** Items are grouped by `fulfillmentMode`. Groups are processed in mode-name order and items sorted by `offerId`, so output is deterministic ([shipping.service.ts:58](../../../services/commerce-api/src/modules/shipping/shipping.service.ts#L58)).
- **Group totals.** Group `subtotal = sum(lineTotal)` and `quantity = sum(quantity)` are what the provider receives ([shipping.service.ts:64](../../../services/commerce-api/src/modules/shipping/shipping.service.ts#L64)).
- **Rate checks.** The provider amount must be a non-negative safe integer, and `expiresAt` must be in the future. Either failure is a 400 ([shipping.service.ts:76](../../../services/commerce-api/src/modules/shipping/shipping.service.ts#L76)).
- **Output.** Each group returns `total = subtotal + shippingAmount` plus all carrier and quote fields.

### Zone rates

- **Destination** ([zone-shipping-rate.provider.ts:116](../../../services/commerce-api/src/modules/shipping/zone-shipping-rate.provider.ts#L116)):
  - It is uppercased and must match `^[A-Z]{2}$`, else 400.
  - A destination listed in `SHIPPING_UNSUPPORTED_COUNTRIES` (comma-separated, trimmed, case-insensitive) is a 400.
- **Domestic** (country == `SHIPPING_DOMESTIC_COUNTRY`) ([zone-shipping-rate.provider.ts:51](../../../services/commerce-api/src/modules/shipping/zone-shipping-rate.provider.ts#L51)):
  - At or above the free threshold (`subtotal >= SHIPPING_DOMESTIC_FREE_THRESHOLD_MINOR`): amount 0, `rateCode DOMESTIC_STANDARD_FREE_V1`.
  - Below it: amount `SHIPPING_DOMESTIC_RATE_MINOR`, `DOMESTIC_STANDARD_V1`.
  - ETA 2-5 days.
- **International** (any other country): amount `SHIPPING_INTERNATIONAL_RATE_MINOR`, `INTERNATIONAL_STANDARD_V1`, ETA 7-14 days, regardless of subtotal ([zone-shipping-rate.provider.ts:87](../../../services/commerce-api/src/modules/shipping/zone-shipping-rate.provider.ts#L87)).
- **Carrier fields.** Every rate carries `serviceLevel STANDARD`, `providerCode 'ZONE'`, `carrierCode 'MANUAL'` and `methodCode = rateCode`.
- **Quote identity.** `quoteId` is a random UUID. `expiresAt = now + SHIPPING_QUOTE_TTL_SECONDS` ([zone-shipping-rate.provider.ts:40](../../../services/commerce-api/src/modules/shipping/zone-shipping-rate.provider.ts#L40)).
- **Errors.** Synchronous validation errors are returned as a rejected Promise ([zone-shipping-rate.provider.ts:46](../../../services/commerce-api/src/modules/shipping/zone-shipping-rate.provider.ts#L46)).

## Data

None. Nothing is read from or written to the database. Quotes are not stored by this module.

## Dependencies

- `ConfigService` only.
- Exports `ShippingService` and `SHIPPING_RATE_PROVIDER` ([shipping.module.ts:16](../../../services/commerce-api/src/modules/shipping/shipping.module.ts#L16)).
- Imported by `OrdersModule`. `ShippingLine` builds on `CartLineView` from the cart module.

## Jobs and events

None.

## Configuration

| Env var                                  | Default | Use                                                                                                                                         |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHIPPING_DOMESTIC_COUNTRY`              | `ZM`    | Domestic zone ([zone-shipping-rate.provider.ts:28](../../../services/commerce-api/src/modules/shipping/zone-shipping-rate.provider.ts#L28)) |
| `SHIPPING_DOMESTIC_RATE_MINOR`           | 3000    | Domestic flat rate                                                                                                                          |
| `SHIPPING_DOMESTIC_FREE_THRESHOLD_MINOR` | 50000   | Domestic free-shipping threshold                                                                                                            |
| `SHIPPING_INTERNATIONAL_RATE_MINOR`      | 15000   | International flat rate                                                                                                                     |
| `SHIPPING_UNSUPPORTED_COUNTRIES`         | empty   | Refused destinations                                                                                                                        |
| `SHIPPING_QUOTE_TTL_SECONDS`             | 3600    | Quote lifetime                                                                                                                              |

See [../configuration.md](../configuration.md#shipping). The defaults in `env.validation.ts` match the in-code fallbacks.

## Tests

- [shipping.service.spec.ts](../../../services/commerce-api/src/modules/shipping/shipping.service.spec.ts): deterministic grouping and totals, unsafe amount, already-expired quote.
- [zone-shipping-rate.provider.spec.ts](../../../services/commerce-api/src/modules/shipping/zone-shipping-rate.provider.spec.ts): domestic below and at the threshold, international, case normalisation, invalid ISO code, unsupported list, config overrides.
- No test covers the currency-mismatch rejection in `ShippingService`.

## Known gaps

- **Currency is ignored.** The provider ignores `request.currency`: the configured amounts are applied as minor units of whatever currency checkout uses. The comment assumes ZMW ([zone-shipping-rate.provider.ts:11](../../../services/commerce-api/src/modules/shipping/zone-shipping-rate.provider.ts#L11)).
- **Some inputs are unused.** `sellerId`, `fulfillmentMode` and `quantity` do not affect the rate. There is no weight, dimension or per-seller policy.
- **Quotes are not checked at checkout.** `quoteId`/`expiresAt` are generated but never re-validated by this module. Checkout re-quotes rather than honouring a stored quote.
- **Every quote names the MANUAL carrier.** Since `carrierCode` is always `MANUAL`, every platform shipment books through the manual carrier ([zone-shipping-rate.provider.ts:81](../../../services/commerce-api/src/modules/shipping/zone-shipping-rate.provider.ts#L81)).
