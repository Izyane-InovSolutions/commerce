import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

import { FxRatesService } from './fx-rates.service';

// The free exchangerate-api.com tier updates once every 24h; hourly polling
// costs ~720 requests/month, safely under its 1,500/month cap, and picks up
// a new rate promptly once one is published.
export const FX_REFRESH_INTERVAL_MS = 60 * 60 * 1_000;

/**
 * Keeps FxRatesService's cache live so PaymentCurrencyConverter never needs
 * PAYMENT_FX_QUOTES hand-edited in production — see FxRatesService.refresh
 * for the "no API key configured" no-op case.
 */
@Injectable()
export class FxRatesRefreshScheduler implements OnModuleInit {
  private readonly logger = new Logger(FxRatesRefreshScheduler.name);

  constructor(
    private readonly fxRates: FxRatesService,
    private readonly config: ConfigService,
  ) {}

  // Populates the cache immediately at boot rather than waiting a full
  // interval for the first refresh. Skipped in NODE_ENV=test: every test
  // suite that boots the full Nest app (ConfigModule loads the real .env,
  // including a genuine PAYMENT_FX_API_KEY) would otherwise make a live
  // outbound call to exchangerate-api.com on every single test run.
  async onModuleInit(): Promise<void> {
    if (this.config.get('NODE_ENV') === 'test') return;
    await this.refresh();
  }

  @Interval(FX_REFRESH_INTERVAL_MS)
  async refresh(): Promise<void> {
    try {
      await this.fxRates.refresh(FX_REFRESH_INTERVAL_MS);
    } catch (error) {
      this.logger.error(
        'FX rate refresh failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
