import type { Address } from '@prisma/client';

import { toAddressSnapshot } from './address-snapshot';

function buildAddress(overrides: Partial<Address> = {}): Address {
  return {
    id: 'addr-1',
    userId: 'user-1',
    label: 'Home',
    recipientName: 'Jane Doe',
    phone: '555-0100',
    line1: '123 Main St',
    line2: null,
    city: 'Springfield',
    region: 'IL',
    postalCode: '62701',
    country: 'US',
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('toAddressSnapshot', () => {
  it('excludes id, userId, isDefault, and timestamps', () => {
    const snapshot = toAddressSnapshot(buildAddress());

    expect(snapshot).toEqual({
      label: 'Home',
      recipientName: 'Jane Doe',
      phone: '555-0100',
      line1: '123 Main St',
      line2: null,
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      country: 'US',
    });
  });
});
