import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { CARRIER_PROVIDERS, type CarrierProvider } from './carrier-provider.interface';

@Injectable()
export class CarrierProviderRegistry {
  private readonly byProviderCode: Map<string, CarrierProvider>;

  constructor(@Inject(CARRIER_PROVIDERS) providers: CarrierProvider[]) {
    this.byProviderCode = new Map(providers.map((provider) => [provider.providerCode, provider]));
  }

  get(providerCode: string): CarrierProvider {
    const provider = this.byProviderCode.get(providerCode);
    if (!provider) {
      throw new NotFoundException(`No carrier provider registered for "${providerCode}"`);
    }
    return provider;
  }

  list(): CarrierProvider[] {
    return [...this.byProviderCode.values()];
  }
}
