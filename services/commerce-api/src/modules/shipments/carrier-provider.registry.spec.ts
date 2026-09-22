import { NotFoundException } from '@nestjs/common';

import type { CarrierProvider } from './carrier-provider.interface';
import { CarrierProviderRegistry } from './carrier-provider.registry';

function fakeProvider(providerCode: string): CarrierProvider {
  return {
    providerCode,
    book: jest.fn(),
    cancel: jest.fn(),
    poll: jest.fn(),
  };
}

describe('CarrierProviderRegistry', () => {
  it('resolves a provider by its code', () => {
    const zone = fakeProvider('ZONE');
    const registry = new CarrierProviderRegistry([zone, fakeProvider('DHL')]);

    expect(registry.get('ZONE')).toBe(zone);
  });

  it('throws when no provider is registered for the code', () => {
    const registry = new CarrierProviderRegistry([fakeProvider('ZONE')]);

    expect(() => registry.get('UNKNOWN')).toThrow(NotFoundException);
  });

  it('lists every registered provider', () => {
    const registry = new CarrierProviderRegistry([fakeProvider('ZONE'), fakeProvider('DHL')]);

    expect(registry.list().map((p) => p.providerCode).sort()).toEqual(['DHL', 'ZONE']);
  });
});
