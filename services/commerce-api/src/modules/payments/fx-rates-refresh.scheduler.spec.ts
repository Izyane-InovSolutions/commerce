import { ConfigService } from '@nestjs/config';

import { FxRatesRefreshScheduler } from './fx-rates-refresh.scheduler';
import type { FxRatesService } from './fx-rates.service';

describe('FxRatesRefreshScheduler', () => {
  it('skips the boot refresh under NODE_ENV=test — every test suite that boots the full app would otherwise call the live FX API', async () => {
    const fxRates = { refresh: jest.fn().mockResolvedValue(undefined) };
    const scheduler = new FxRatesRefreshScheduler(
      fxRates as unknown as FxRatesService,
      new ConfigService({ NODE_ENV: 'test' }),
    );

    await scheduler.onModuleInit();

    expect(fxRates.refresh).not.toHaveBeenCalled();
  });

  it('refreshes once at boot outside of NODE_ENV=test, without waiting for the first interval', async () => {
    const fxRates = { refresh: jest.fn().mockResolvedValue(undefined) };
    const scheduler = new FxRatesRefreshScheduler(
      fxRates as unknown as FxRatesService,
      new ConfigService({ NODE_ENV: 'development' }),
    );

    await scheduler.onModuleInit();

    expect(fxRates.refresh).toHaveBeenCalledTimes(1);
  });

  it('never throws out of refresh() when the underlying service rejects', async () => {
    const fxRates = {
      refresh: jest.fn().mockRejectedValue(new Error('provider down')),
    };
    const scheduler = new FxRatesRefreshScheduler(
      fxRates as unknown as FxRatesService,
      new ConfigService({ NODE_ENV: 'development' }),
    );

    await expect(scheduler.refresh()).resolves.toBeUndefined();
  });
});
