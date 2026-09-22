import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../database/prisma.service';
import type { FxRateProvider } from './fx-rate-provider';
import { FxRatesService } from './fx-rates.service';

function buildPrisma(): {
  fxRate: { findMany: jest.Mock; upsert: jest.Mock };
  $transaction: jest.Mock;
} {
  const prisma = {
    fxRate: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  return prisma;
}

describe('FxRatesService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let provider: { fetchRates: jest.Mock };
  let service: FxRatesService;

  beforeEach(() => {
    prisma = buildPrisma();
    provider = { fetchRates: jest.fn() };
  });

  function build(config: Record<string, unknown> = {}): FxRatesService {
    return new FxRatesService(
      prisma as unknown as PrismaService,
      new ConfigService(config),
      provider as unknown as FxRateProvider,
    );
  }

  describe('refresh', () => {
    it('does nothing when no API key is configured', async () => {
      // Explicit empty string, not just an absent key: ConfigService falls
      // back to the real process.env (which may genuinely have a key set
      // for live use) when a key is missing from its internal config
      // entirely, so "absent" must be forced this way to test reliably.
      service = build({ PAYMENT_FX_API_KEY: '' });
      await service.refresh(60_000);
      expect(provider.fetchRates).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('fetches against the configured base currency and upserts every non-base rate', async () => {
      service = build({
        PAYMENT_FX_API_KEY: 'key',
        PAYMENT_FX_BASE_CURRENCY: 'ZMW',
      });
      provider.fetchRates.mockResolvedValue({
        ZMW: '1.00000000',
        USD: '0.03700000',
        GBP: '0.02900000',
      });

      await service.refresh(60_000);

      expect(provider.fetchRates).toHaveBeenCalledWith('ZMW');
      expect(prisma.fxRate.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.fxRate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { targetCurrency: 'USD' },
          create: expect.objectContaining({
            targetCurrency: 'USD',
            baseCurrency: 'ZMW',
            rate: '0.03700000',
          }) as object,
        }),
      );
    });

    it('is a no-op when the provider returns nothing usable', async () => {
      service = build({ PAYMENT_FX_API_KEY: 'key' });
      provider.fetchRates.mockResolvedValue({});
      await service.refresh(60_000);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getEntry', () => {
    it('is empty until hydrated, and reflects the DB after onModuleInit', async () => {
      const fetchedAt = new Date('2026-09-18T00:00:00Z');
      const expiresAt = new Date('2026-09-18T02:00:00Z');
      prisma.fxRate.findMany.mockResolvedValue([
        { id: 'row-1', targetCurrency: 'USD', rate: '0.037', fetchedAt, expiresAt },
      ]);
      service = build();

      expect(service.getEntry('USD')).toBeUndefined();
      await service.onModuleInit();

      expect(service.getEntry('USD')).toEqual({
        rate: '0.037',
        quoteId: `fx:row-1:${fetchedAt.getTime()}`,
        expiresAt,
      });
      expect(service.getEntry('GBP')).toBeUndefined();
    });

    it('reflects the latest refresh without a separate hydrate call', async () => {
      service = build({ PAYMENT_FX_API_KEY: 'key' });
      provider.fetchRates.mockResolvedValue({ USD: '0.04000000' });
      prisma.fxRate.findMany.mockResolvedValue([
        {
          id: 'row-2',
          targetCurrency: 'USD',
          rate: '0.04000000',
          fetchedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]);

      await service.refresh(60_000);

      expect(service.getEntry('USD')?.rate).toBe('0.04000000');
    });
  });
});
