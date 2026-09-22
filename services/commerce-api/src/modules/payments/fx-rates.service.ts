import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../database/prisma.service';
import { FX_RATE_PROVIDER, type FxRateProvider } from './fx-rate-provider';
import type { RateEntry } from './payment-currency-converter';

// A rate stays usable for two refresh cycles past the one that produced it,
// so one missed/failed refresh (e.g. a transient FX provider outage) doesn't
// immediately disable foreign settlement.
const EXPIRY_GRACE_CYCLES = 2;

@Injectable()
export class FxRatesService implements OnModuleInit {
  private readonly logger = new Logger(FxRatesService.name);
  private cache = new Map<string, RateEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(FX_RATE_PROVIDER) private readonly provider: FxRateProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.hydrateFromDb();
  }

  /** Synchronous, in-memory — PaymentCurrencyConverter.quote() never blocks on I/O. */
  getEntry(currency: string): RateEntry | undefined {
    return this.cache.get(currency);
  }

  /** No-op when PAYMENT_FX_API_KEY is unset — callers fall back to PAYMENT_FX_QUOTES. */
  async refresh(intervalMs: number): Promise<void> {
    if (!this.config.get<string>('PAYMENT_FX_API_KEY')) return;
    const base = this.config.get<string>('PAYMENT_FX_BASE_CURRENCY', 'ZMW');
    const rates = await this.provider.fetchRates(base);
    const fetchedAt = new Date();
    const expiresAt = new Date(
      fetchedAt.getTime() + intervalMs * EXPIRY_GRACE_CYCLES,
    );

    const entries = Object.entries(rates).filter(([currency]) => currency !== base);
    if (entries.length === 0) return;

    await this.prisma.$transaction(
      entries.map(([currency, rate]) =>
        this.prisma.fxRate.upsert({
          where: { targetCurrency: currency },
          create: {
            targetCurrency: currency,
            baseCurrency: base,
            rate,
            fetchedAt,
            expiresAt,
          },
          update: { rate, baseCurrency: base, fetchedAt, expiresAt },
        }),
      ),
    );
    await this.hydrateFromDb();
    this.logger.log(`Refreshed ${entries.length} FX rates against ${base}`);
  }

  private async hydrateFromDb(): Promise<void> {
    const rows = await this.prisma.fxRate.findMany();
    this.cache = new Map(
      rows.map((row) => [
        row.targetCurrency,
        {
          rate: row.rate,
          quoteId: `fx:${row.id}:${row.fetchedAt.getTime()}`,
          expiresAt: row.expiresAt,
        },
      ]),
    );
  }
}
