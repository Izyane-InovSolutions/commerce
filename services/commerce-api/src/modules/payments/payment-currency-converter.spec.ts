import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { PaymentCurrencyConverter } from './payment-currency-converter';

describe('PaymentCurrencyConverter', () => {
  const at = new Date('2026-09-14T00:00:00Z');
  function converter(
    currency: string,
    rate: string,
    expiresAt = '2026-09-15T00:00:00Z',
  ) {
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
});
