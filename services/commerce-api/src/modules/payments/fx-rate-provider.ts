export const FX_RATE_PROVIDER = Symbol('FX_RATE_PROVIDER');

/** A fetched rate, expressed as target-currency major units per one unit of the base currency. */
export interface FxRateProvider {
  fetchRates(baseCurrency: string): Promise<Record<string, string>>;
}
