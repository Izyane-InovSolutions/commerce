import type { BackendUser } from '@commerce/contracts';
import { describe, expect, it } from 'vitest';

import { navigation, navigationFor } from './navigation';

function userWith(role: BackendUser['role']): BackendUser {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'someone@commerce.test',
    role,
  };
}

const hrefs = (role: BackendUser['role']) =>
  navigationFor(userWith(role)).map((item) => item.href);

describe('navigationFor', () => {
  it('gives an administrator every section', () => {
    expect(navigationFor(userWith('ADMIN'))).toEqual(navigation);
  });

  it('gives staff only the sections whose reads staff may make', () => {
    expect(hrefs('STAFF')).toEqual([
      '/',
      '/catalog',
      '/categories',
      '/brands',
      '/orders',
      '/returns',
      '/inventory',
      '/procurement',
      '/support',
      '/analytics',
    ]);
  });

  it('hides every administrator-only section from staff', () => {
    const staff = new Set(hrefs('STAFF'));
    for (const item of navigation.filter((entry) => entry.adminOnly)) {
      expect(staff.has(item.href)).toBe(false);
    }
  });

  it('gives any other role nothing', () => {
    expect(hrefs('CUSTOMER')).toEqual([]);
    expect(hrefs('SELLER')).toEqual([]);
  });

  it('lists procurement straight after inventory', () => {
    const all = navigation.map((item) => item.href);
    expect(all.indexOf('/procurement')).toBe(all.indexOf('/inventory') + 1);
  });
});
