import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { FxRateProvider } from './fx-rate-provider';

const REQUEST_TIMEOUT_MS = 10_000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * https://www.exchangerate-api.com — free-tier "latest" endpoint, one call
 * per refresh. Never called without PAYMENT_FX_API_KEY configured; the
 * caller (FxRatesService) is responsible for skipping the refresh entirely
 * when no key is set, so a missing key never surfaces as a request failure.
 */
@Injectable()
export class ExchangeRateApiProvider implements FxRateProvider {
  constructor(private readonly config: ConfigService) {}

  async fetchRates(baseCurrency: string): Promise<Record<string, string>> {
    const apiKey = this.config.get<string>('PAYMENT_FX_API_KEY');
    if (!apiKey)
      throw new ServiceUnavailableException('PAYMENT_FX_API_KEY is not configured');

    const url = `https://v6.exchangerate-api.com/v6/${encodeURIComponent(apiKey)}/latest/${encodeURIComponent(baseCurrency)}`;
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException('FX provider request failed');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ServiceUnavailableException('FX provider returned an invalid response');
    }

    if (
      !response.ok ||
      !record(body) ||
      body.result !== 'success' ||
      !record(body.conversion_rates)
    )
      throw new ServiceUnavailableException(
        record(body) && typeof body['error-type'] === 'string'
          ? `FX provider error: ${body['error-type']}`
          : 'FX provider returned an unexpected response',
      );

    const rates: Record<string, string> = {};
    for (const [currency, value] of Object.entries(body.conversion_rates)) {
      if (
        /^[A-Z]{3}$/.test(currency) &&
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value > 0
      )
        rates[currency] = value.toFixed(8);
    }
    return rates;
  }
}
