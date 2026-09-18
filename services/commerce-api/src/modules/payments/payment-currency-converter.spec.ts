import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  PaymentCurrencyConverter,
  type RateSource,
} from './payment-currency-converter';

describe('PaymentCurrencyConverter', () => {
  const at = new Date('2026-09-14T00:00:00Z');
  function converter(
    currency: string,
    rate: string,
    expiresAt = '2026-09-15T00:00:00Z',
  ): PaymentCurrencyConverter {
    return new PaymentCurrencyConverter(
      new ConfigService({
        PAYMENT_FX_QUOTES: JSON.stringify({
          [currency]: { rate, quoteId: 'test-quote', expiresAt },
        }),
      }),
    );
  }

  it('converts ZMW minor units using a backend quote', () => {
    expect(converter('USD', '0.05').quote(12345, 'USD', at)).toMatchObject({
      amount: 617,
      currency: 'USD',
      rate: '0.05',
      quoteId: 'test-quote',
    });
  });

  it('rounds half up and respects target currency minor units', () => {
    expect(converter('USD', '0.5').quote(1, 'USD', at).amount).toBe(1);
    expect(converter('JPY', '5').quote(1250, 'JPY', at).amount).toBe(63);
    expect(converter('KWD', '0.02').quote(1250, 'KWD', at).amount).toBe(250);
  });

  it('refuses missing, expired and invalid rates without inventing a rate', () => {
    expect(() =>
      new PaymentCurrencyConverter(new ConfigService()).quote(100, 'USD', at),
    ).toThrow(ServiceUnavailableException);
    for (const rate of ['0', '-1', 'NaN', '1e3', '0.000000000001']) {
      expect(() => converter('USD', rate).quote(100, 'USD', at)).toThrow(
        ServiceUnavailableException,
      );
    }
    expect(() =>
      converter('USD', '0.05', at.toISOString()).quote(100, 'USD', at),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      converter('USD', '999999999999').quote(2147483647, 'USD', at),
    ).toThrow(ServiceUnavailableException);
  });

  describe('with a live RateSource', () => {
    function rateSource(entry?: {
      rate: string;
      quoteId: string;
      expiresAt: Date;
    }): RateSource {
      return { getEntry: () => entry };
    }

    it('prefers a live rate over PAYMENT_FX_QUOTES when both are present', () => {
      const converterWithLiveRate = new PaymentCurrencyConverter(
        new ConfigService({
          PAYMENT_FX_QUOTES: JSON.stringify({
            USD: { rate: '999', quoteId: 'manual', expiresAt: '2026-09-15T00:00:00Z' },
          }),
        }),
        rateSource({
          rate: '0.05',
          quoteId: 'fx:live-1',
          expiresAt: new Date('2026-09-15T00:00:00Z'),
        }),
      );

      expect(converterWithLiveRate.quote(12345, 'USD', at)).toMatchObject({
        amount: 617,
        rate: '0.05',
        quoteId: 'fx:live-1',
      });
    });

    it('falls back to PAYMENT_FX_QUOTES when the live source has no entry for the currency', () => {
      const converterWithFallback = new PaymentCurrencyConverter(
        new ConfigService({
          PAYMENT_FX_QUOTES: JSON.stringify({
            USD: { rate: '0.05', quoteId: 'manual', expiresAt: '2026-09-15T00:00:00Z' },
          }),
        }),
        rateSource(undefined),
      );

      expect(converterWithFallback.quote(12345, 'USD', at)).toMatchObject({
        rate: '0.05',
        quoteId: 'manual',
      });
    });

    it('refuses a malformed live rate rather than inventing one', () => {
      const converterWithBadLiveRate = new PaymentCurrencyConverter(
        new ConfigService(),
        rateSource({
          rate: 'not-a-number',
          quoteId: 'fx:live-1',
          expiresAt: new Date('2026-09-15T00:00:00Z'),
        }),
      );

      expect(() => converterWithBadLiveRate.quote(100, 'USD', at)).toThrow(
        ServiceUnavailableException,
      );
    });

    it('refuses an expired live rate', () => {
      const converterWithExpiredLiveRate = new PaymentCurrencyConverter(
        new ConfigService(),
        rateSource({
          rate: '0.05',
          quoteId: 'fx:live-1',
          expiresAt: new Date('2026-09-13T00:00:00Z'),
        }),
      );

      expect(() => converterWithExpiredLiveRate.quote(100, 'USD', at)).toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
