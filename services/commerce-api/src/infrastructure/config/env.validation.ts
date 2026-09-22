import { Type, plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false })
  DATABASE_URL!: string;

  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false })
  SHADOW_DATABASE_URL!: string;

  @MinLength(32)
  JWT_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  ACCESS_TOKEN_TTL_SECONDS = 900;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  REFRESH_TOKEN_TTL_SECONDS = 2_592_000;

  @IsString()
  @IsNotEmpty()
  MEDIA_STORAGE_PATH = '.data/media';

  @MinLength(32)
  MEDIA_SIGNING_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  MEDIA_MAX_FILE_SIZE_BYTES = 10_485_760;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  MEDIA_URL_TTL_SECONDS = 900;

  // Product image URLs are embedded in catalog responses that clients cache,
  // so they outlive the general TTL above.
  @Type(() => Number)
  @IsInt()
  @Min(60)
  MEDIA_PUBLIC_URL_TTL_SECONDS = 86_400;

  @IsIn(['pending', 'unified'])
  PAYMENTS_PROVIDER = 'pending';

  @ValidateIf(
    (env: EnvironmentVariables) => env.PAYMENTS_PROVIDER === 'unified',
  )
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  UNIFIED_PAYMENTS_BASE_URL?: string;

  @ValidateIf(
    (env: EnvironmentVariables) => env.PAYMENTS_PROVIDER === 'unified',
  )
  @IsString()
  @IsNotEmpty()
  UNIFIED_PAYMENTS_API_KEY?: string;

  @IsString()
  UNIFIED_PAYMENTS_MERCHANT_ID = '';

  // Settlement currency the card connector charges in; conversion from ZMW
  // happens on the backend via PAYMENT_FX_QUOTES below.
  @IsString()
  @MinLength(3)
  UNIFIED_PAYMENTS_CARD_CURRENCY = 'USD';

  // Optional, and only honoured once the gateway's webhook signing scheme is
  // known — see UnifiedPaymentProvider.callbackUrl.
  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  UNIFIED_PAYMENTS_CALLBACK_URL?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(60000)
  UNIFIED_PAYMENTS_TIMEOUT_MS = 15000;

  // Basis points (1/100 of a percent) - 1000 = 10%. Single platform-wide
  // rate; per-seller/per-category rates aren't needed yet.
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  MARKETPLACE_COMMISSION_BPS = 1000;

  // Seller payout policy. Sale proceeds remain in the held bucket until the
  // reserve window expires; a request must meet the minimum and use a
  // verified destination before funds can move to pending payout.
  @Type(() => Number)
  @IsInt()
  @Min(0)
  SELLER_PAYOUT_HOLD_DAYS = 0;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  SELLER_PAYOUT_MINIMUM_MINOR = 1;

  @IsIn(['manual'])
  SELLER_PAYOUT_PROVIDER = 'manual';

  // JSON keyed by target currency; see PaymentCurrencyConverter. Left
  // unvalidated beyond "is a string" — a missing, expired or malformed quote
  // safely disables foreign settlement at request time rather than failing
  // startup. Manual fallback only, used when PAYMENT_FX_API_KEY is unset
  // (dev/test) — FxRatesService's auto-refreshed rates take priority
  // whenever a key is configured.
  @IsString()
  PAYMENT_FX_QUOTES = '{}';

  // exchangerate-api.com key — see https://www.exchangerate-api.com. Unset
  // means FxRatesRefreshScheduler never calls out and PaymentCurrencyConverter
  // falls back to PAYMENT_FX_QUOTES.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  PAYMENT_FX_API_KEY?: string;

  // Rates express target major units per one unit of this currency,
  // matching PaymentCurrencyConverter's existing convention.
  @IsString()
  @MinLength(3)
  PAYMENT_FX_BASE_CURRENCY = 'ZMW';

  // See ZoneShippingRateProvider. Domestic is ZMW's home market and gets the
  // cheaper rate plus a free-shipping threshold; everywhere else pays the
  // flat international rate.
  @IsString()
  SHIPPING_DOMESTIC_COUNTRY = 'ZM';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  SHIPPING_DOMESTIC_RATE_MINOR = 3_000;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  SHIPPING_DOMESTIC_FREE_THRESHOLD_MINOR = 50_000;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  SHIPPING_INTERNATIONAL_RATE_MINOR = 15_000;

  // Comma-separated ISO-2 country codes shipping is refused to. Empty by
  // default — there is no real carrier restriction list yet.
  @IsString()
  SHIPPING_UNSUPPORTED_COUNTRIES = '';

  @Type(() => Number)
  @IsInt()
  @Min(60)
  SHIPPING_QUOTE_TTL_SECONDS = 3_600;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.toString()}`);
  }

  return validatedConfig;
}
