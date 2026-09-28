import { describe, expect, it } from 'vitest';

import {
  assignableRoles,
  fullName,
  isUserFiltered,
  readUserFilters,
  roleChangeBlocker,
  toAdminUserQuery,
} from './users';

describe('readUserFilters', () => {
  it('defaults to the first page, unfiltered', () => {
    const filters = readUserFilters({});
    expect(filters).toEqual({
      page: 1,
      q: undefined,
      role: undefined,
      status: undefined,
    });
    expect(isUserFiltered(filters)).toBe(false);
  });

  it('reads known values and drops unknown ones', () => {
    expect(
      readUserFilters({
        page: '3',
        q: '  jane ',
        role: 'STAFF',
        status: 'DISABLED',
      }),
    ).toEqual({ page: 3, q: 'jane', role: 'STAFF', status: 'DISABLED' });
    expect(
      readUserFilters({ page: '-2', q: '   ', role: 'ROOT', status: 'gone' }),
    ).toEqual({ page: 1, q: undefined, role: undefined, status: undefined });
  });

  it('sends the page size with the query', () => {
    expect(toAdminUserQuery({ page: 2, role: 'ADMIN' })).toEqual({
      page: 2,
      role: 'ADMIN',
      limit: 20,
    });
  });
});

describe('fullName', () => {
  it('joins whichever names are present', () => {
    expect(fullName({ firstName: 'Jane', lastName: 'Doe' })).toBe('Jane Doe');
    expect(fullName({ firstName: null, lastName: 'Doe' })).toBe('Doe');
    expect(fullName({ firstName: ' ', lastName: null })).toBeNull();
  });
});

describe('roleChangeBlocker', () => {
  const seller = { id: 's', businessName: 'Shop', status: 'APPROVED' as const };

  it('blocks changing your own role', () => {
    expect(
      roleChangeBlocker({ id: 'me', role: 'ADMIN', seller: null }, 'me'),
    ).toMatch(/own role/);
  });

  it('blocks moving a seller owner or applicant', () => {
    expect(
      roleChangeBlocker({ id: 'u', role: 'SELLER', seller }, 'me'),
    ).toMatch(/suspend the seller/);
    expect(
      roleChangeBlocker(
        { id: 'u', role: 'CUSTOMER', seller: { ...seller, status: 'PENDING' } },
        'me',
      ),
    ).toMatch(/application/);
  });

  it('allows everyone else', () => {
    expect(
      roleChangeBlocker({ id: 'u', role: 'STAFF', seller: null }, 'me'),
    ).toBeNull();
  });
});

describe('assignableRoles', () => {
  it('offers SELLER only to an approved seller owner', () => {
    expect(assignableRoles({ seller: null })).toEqual([
      'CUSTOMER',
      'STAFF',
      'ADMIN',
    ]);
    expect(
      assignableRoles({
        seller: { id: 's', businessName: 'Shop', status: 'SUSPENDED' },
      }),
    ).toContain('SELLER');
  });
});
