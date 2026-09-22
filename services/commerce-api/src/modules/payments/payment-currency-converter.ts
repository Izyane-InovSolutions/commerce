import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SettlementQuote = {
  amount: number;
  currency: string;
  rate: string;
  quoteId: string;
  expiresAt: Date;
};

export type RateEntry = {
  rate: string;
  quoteId: string;
  expiresAt: Date;
};

/** Minimal shape FxRatesService satisfies — kept separate so this file never
 * imports the live-refresh machinery, only the read interface it needs. */
export interface RateSource {
  getEntry(currency: string): RateEntry | undefined;
}

/** Backend-only conversion boundary; never accept a rate or settlement amount
 * from a client. Rates express target major units per one unit of the base
 * currency. Integer arithmetic rounds half up once, at the target currency's
 * minor unit.
 *
 * Prefers `rates` (FxRatesService's auto-refreshed cache) when given and it
 * has an entry for the requested currency; otherwise falls back to the
 * PAYMENT_FX_QUOTES env var — the manual path, kept for dev/test and as a
 * safety net when no PAYMENT_FX_API_KEY is configured. */
export class PaymentCurrencyConverter {
  constructor(
    private readonly config: ConfigService,
    private readonly rates?: RateSource,
  ) {}

  quote(amount: number, currency: string, at = new Date()): SettlementQuote {
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new BadRequestException(
        'Payment amount must be positive minor units',
      );
    const unavailable = (): ServiceUnavailableException =>
      new ServiceUnavailableException(
        'This payment method is temporarily unavailable',
      );
    if (!/^[A-Z]{3}$/.test(currency)) throw unavailable();

    const { rate, quoteId, expiresAt } = this.resolveEntry(currency, unavailable);
    const expiry = new Date(expiresAt);
    if (!Number.isFinite(expiry.getTime()) || expiry <= at) throw unavailable();
    const [whole, fraction = ''] = rate.split('.');
    const numerator = BigInt(whole + fraction);
    if (numerator <= 0n) throw unavailable();
    const digits =
      new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
    const denominator = 100n * 10n ** BigInt(fraction.length);
    const scaled = BigInt(amount) * numerator * 10n ** BigInt(digits);
    const converted = (scaled + denominator / 2n) / denominator;
    if (converted <= 0n || converted > 2147483647n) throw unavailable();
    return {
      amount: Number(converted),
      currency,
      rate,
      quoteId,
      expiresAt: expiry,
    };
  }

  private resolveEntry(
    currency: string,
    unavailable: () => ServiceUnavailableException,
  ): { rate: string; quoteId: string; expiresAt: string | Date } {
    const live = this.rates?.getEntry(currency);
    if (live) {
      if (!/^\d{1,12}(\.\d{1,12})?$/.test(live.rate)) throw unavailable();
      return live;
    }

    let quotes: Record<string, unknown>;
    try {
      quotes = JSON.parse(
        this.config.get<string>('PAYMENT_FX_QUOTES', '{}'),
      ) as Record<string, unknown>;
    } catch {
      throw unavailable();
    }
    const entry = quotes?.[currency];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw unavailable();
    const { rate, quoteId, expiresAt } = entry as Record<string, unknown>;
    if (
      typeof rate !== 'string' ||
      !/^\d{1,12}(\.\d{1,12})?$/.test(rate) ||
      typeof quoteId !== 'string' ||
      !quoteId.trim() ||
      quoteId.length > 200 ||
      typeof expiresAt !== 'string'
    )
      throw unavailable();
    return { rate, quoteId, expiresAt };
  }
}
