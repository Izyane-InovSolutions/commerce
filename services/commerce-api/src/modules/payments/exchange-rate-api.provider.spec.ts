import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';

import { ExchangeRateApiProvider } from './exchange-rate-api.provider';

describe('ExchangeRateApiProvider', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  function reply(value: unknown, status = 200): void {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(value), { status }));
  }

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it('rejects when no API key is configured, without calling out', async () => {
    // Explicit empty string: ConfigService falls back to the real
    // process.env (which may genuinely have a key configured for live use)
    // when a key is absent from its internal config entirely.
    const provider = new ExchangeRateApiProvider(
      new ConfigService({ PAYMENT_FX_API_KEY: '' }),
    );
    await expect(provider.fetchRates('ZMW')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the v6 latest endpoint with the key and base currency in the URL', async () => {
    reply({ result: 'success', conversion_rates: { USD: 0.037 } });
    const provider = new ExchangeRateApiProvider(
      new ConfigService({ PAYMENT_FX_API_KEY: 'test-key' }),
    );
    await provider.fetchRates('ZMW');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://v6.exchangerate-api.com/v6/test-key/latest/ZMW',
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('formats numeric rates to 8 decimal places and drops the base currency entry', async () => {
    reply({
      result: 'success',
      conversion_rates: { ZMW: 1, USD: 0.037, GBP: 0.029 },
    });
    const provider = new ExchangeRateApiProvider(
      new ConfigService({ PAYMENT_FX_API_KEY: 'test-key' }),
    );
    const rates = await provider.fetchRates('ZMW');
    expect(rates).toEqual({
      ZMW: '1.00000000',
      USD: '0.03700000',
      GBP: '0.02900000',
    });
  });

  it('drops non-3-letter currency keys and non-positive/non-finite rate values', async () => {
    reply({
      result: 'success',
      conversion_rates: {
        USD: 0.037,
        XXXX: 1,
        ZERO: 0,
        NEG: -1,
        NAN: Number.NaN,
      },
    });
    const provider = new ExchangeRateApiProvider(
      new ConfigService({ PAYMENT_FX_API_KEY: 'test-key' }),
    );
    expect(await provider.fetchRates('ZMW')).toEqual({ USD: '0.03700000' });
  });

  it('refuses a non-success result without inventing rates', async () => {
    reply({ result: 'error', 'error-type': 'invalid-key' }, 200);
    const provider = new ExchangeRateApiProvider(
      new ConfigService({ PAYMENT_FX_API_KEY: 'bad-key' }),
    );
    await expect(provider.fetchRates('ZMW')).rejects.toThrow(
      /invalid-key/,
    );
  });

  it('refuses a non-2xx HTTP response', async () => {
    reply({ result: 'error' }, 503);
    const provider = new ExchangeRateApiProvider(
      new ConfigService({ PAYMENT_FX_API_KEY: 'test-key' }),
    );
    await expect(provider.fetchRates('ZMW')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('refuses when the network call itself fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const provider = new ExchangeRateApiProvider(
      new ConfigService({ PAYMENT_FX_API_KEY: 'test-key' }),
    );
    await expect(provider.fetchRates('ZMW')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('refuses an unparsable response body', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));
    const provider = new ExchangeRateApiProvider(
      new ConfigService({ PAYMENT_FX_API_KEY: 'test-key' }),
    );
    await expect(provider.fetchRates('ZMW')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
