import type {
  Offer,
  Paginated,
  Product,
  Seller,
  SellerApplication,
  Session,
  User,
} from '@commerce/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { SEED_PASSWORD } from './seed.ts';
import { db, resetDb } from './store.ts';
import { ACCOUNTS, call, signIn } from './testing.ts';

let admin: string;
let seller: string;
let shopper: string;
let applicant: string;

beforeEach(async () => {
  resetDb();
  admin = (await signIn(ACCOUNTS.admin)).token;
  seller = (await signIn(ACCOUNTS.deskworks)).token;
  shopper = (await signIn(ACCOUNTS.shopper)).token;
  applicant = (await signIn(ACCOUNTS.applicant)).token;
});

describe('sign up and sign in', () => {
  it('creates a shopper account with only the customer role', async () => {
    const { status, data } = await call<Session>('POST', '/auth/sign-up', {
      body: {
        name: 'New Shopper',
        email: 'new@example.test',
        password: 'a-good-password',
      },
    });

    expect(status).toBe(201);
    expect(data.user.roles).toEqual(['customer']);
    expect(data.user.sellerId).toBeNull();
  });

  it('will not grant a role the caller asks for', async () => {
    const { data } = await call<Session>('POST', '/auth/sign-up', {
      body: {
        name: 'Sneaky',
        email: 'sneaky@example.test',
        password: 'a-good-password',
        roles: ['admin'],
        sellerId: db().sellers[0]!.id,
      },
    });

    expect(data.user.roles).toEqual(['customer']);
    expect(data.user.sellerId).toBeNull();
  });

  it('rejects a duplicate email', async () => {
    const { status } = await call('POST', '/auth/sign-up', {
      body: {
        name: 'Again',
        email: ACCOUNTS.shopper,
        password: 'a-good-password',
      },
    });

    expect(status).toBe(409);
  });

  it('rejects a short password', async () => {
    const { status } = await call('POST', '/auth/sign-up', {
      body: { name: 'Short', email: 'short@example.test', password: 'abc' },
    });

    expect(status).toBe(400);
  });

  it('rejects a wrong password without saying which part was wrong', async () => {
    const { status, data } = await call<{ message: string }>(
      'POST',
      '/auth/sign-in',
      { body: { email: ACCOUNTS.shopper, password: 'not-it' } },
    );

    expect(status).toBe(401);
    expect(data.message).toBe('That email and password do not match.');
  });

  it('gives the same answer for an unknown email', async () => {
    const { status, data } = await call<{ message: string }>(
      'POST',
      '/auth/sign-in',
      { body: { email: 'nobody@example.test', password: SEED_PASSWORD } },
    );

    expect(status).toBe(401);
    expect(data.message).toBe('That email and password do not match.');
  });

  it('returns the signed-in user from /auth/me', async () => {
    const { data } = await call<User>('GET', '/auth/me', { token: shopper });
    expect(data.email).toBe(ACCOUNTS.shopper);
  });

  it('invalidates the token on sign-out', async () => {
    await call('POST', '/auth/sign-out', { token: shopper });
    const { status } = await call('GET', '/auth/me', { token: shopper });
    expect(status).toBe(401);
  });

  it('rejects a made-up token', async () => {
    const { status } = await call('GET', '/auth/me', { token: 'not-a-token' });
    expect(status).toBe(401);
  });
});

describe('concurrent sessions', () => {
  it('lets one person hold several sessions at once', async () => {
    const first = await signIn(ACCOUNTS.admin);
    const second = await signIn(ACCOUNTS.admin);

    expect(first.token).not.toBe(second.token);
    expect((await call('GET', '/auth/me', { token: first.token })).status).toBe(
      200,
    );
    expect(
      (await call('GET', '/auth/me', { token: second.token })).status,
    ).toBe(200);
  });

  it('signs out only the token that was used', async () => {
    const first = await signIn(ACCOUNTS.admin);
    const second = await signIn(ACCOUNTS.admin);

    await call('POST', '/auth/sign-out', { token: first.token });

    expect((await call('GET', '/auth/me', { token: first.token })).status).toBe(
      401,
    );
    expect(
      (await call('GET', '/auth/me', { token: second.token })).status,
    ).toBe(200);
  });

  it('keeps different people signed in side by side', async () => {
    // Two portals open in one browser: an admin and a seller at the same time.
    const adminMe = await call<User>('GET', '/auth/me', { token: admin });
    const sellerMe = await call<User>('GET', '/auth/me', { token: seller });

    expect(adminMe.data.email).toBe(ACCOUNTS.admin);
    expect(sellerMe.data.email).toBe(ACCOUNTS.deskworks);
  });
});

describe('access control', () => {
  it('requires a session for the catalog', async () => {
    expect((await call('GET', '/products')).status).toBe(401);
  });

  it('stops a shopper reaching admin endpoints', async () => {
    expect((await call('GET', '/sellers', { token: shopper })).status).toBe(
      403,
    );
    expect(
      (await call('GET', '/seller-applications', { token: shopper })).status,
    ).toBe(403);
    expect(
      (
        await call('POST', '/inventory/adjustments', {
          token: shopper,
          body: {},
        })
      ).status,
    ).toBe(403);
  });

  it('stops a seller creating a platform-owned product', async () => {
    const { status } = await call('POST', '/products', {
      token: seller,
      body: {
        name: 'Sneaky',
        slug: 'sneaky',
        status: 'active',
        variants: [{ name: 'A', skuCode: 'SNK-1' }],
      },
    });

    expect(status).toBe(403);
  });

  it('stops a seller moderating the catalog', async () => {
    const pending = db().products[0]!;
    expect(
      (await call('POST', `/products/${pending.id}/approve`, { token: seller }))
        .status,
    ).toBe(403);
  });

  it('hides another seller`s offer behind a 404', async () => {
    const other = db().offers.find(
      (offer) => offer.sellerName === 'Harbour Supply Co.',
    )!;

    expect(
      (await call('GET', `/offers/${other.id}`, { token: seller })).status,
    ).toBe(404);
    expect(
      (
        await call('PATCH', `/offers/${other.id}`, {
          token: seller,
          body: { price: '1.00' },
        })
      ).status,
    ).toBe(404);
  });

  it('stops a seller listing stock under another seller', async () => {
    const other = db().sellers.find((s) => s.slug === 'harbour-supply')!;
    const sku = db().products[4]!.variants[0]!.sku;

    const { status } = await call('POST', `/offers?sellerId=${other.id}`, {
      token: seller,
      body: { skuId: sku.id, price: '10.00' },
    });

    expect(status).toBe(403);
  });

  it('stops a shopper with no seller account creating an offer', async () => {
    const sku = db().products[4]!.variants[0]!.sku;
    const { status } = await call('POST', '/offers', {
      token: shopper,
      body: { skuId: sku.id, price: '10.00' },
    });

    expect(status).toBe(403);
  });

  it('stops a suspended seller from trading', async () => {
    const sellerAccount = db().sellers.find((s) => s.slug === 'deskworks')!;
    await call('POST', `/sellers/${sellerAccount.id}/suspend`, {
      token: admin,
    });

    const sku = db().products[4]!.variants[0]!.sku;
    const { status } = await call('POST', '/offers', {
      token: seller,
      body: { skuId: sku.id, price: '10.00' },
    });

    expect(status).toBe(403);
  });
});

describe('seller onboarding', () => {
  const application = {
    displayName: 'Rivers Woodwork',
    slug: 'rivers-woodwork',
    contactEmail: 'hello@rivers.test',
    description: 'Hand-finished oak desks and shelving, made in Bristol.',
  };

  it('lets a shopper apply and reports it back to them', async () => {
    const created = await call<SellerApplication>(
      'POST',
      '/seller-applications',
      {
        token: shopper,
        body: application,
      },
    );

    expect(created.status).toBe(201);
    expect(created.data.status).toBe('pending');
    expect(created.data.sellerId).toBeNull();

    const mine = await call<SellerApplication>(
      'GET',
      '/seller-applications/mine',
      { token: shopper },
    );
    expect(mine.data.id).toBe(created.data.id);
  });

  it('refuses a second application while one is pending', async () => {
    await call('POST', '/seller-applications', {
      token: shopper,
      body: application,
    });
    const { status } = await call('POST', '/seller-applications', {
      token: shopper,
      body: { ...application, slug: 'rivers-two' },
    });

    expect(status).toBe(409);
  });

  it('refuses a store address that is already taken', async () => {
    const { status } = await call('POST', '/seller-applications', {
      token: shopper,
      body: { ...application, slug: 'deskworks' },
    });

    expect(status).toBe(409);
  });

  it('refuses an application from someone who already sells', async () => {
    const { status } = await call('POST', '/seller-applications', {
      token: seller,
      body: application,
    });

    expect(status).toBe(409);
  });

  it('requires a real description', async () => {
    const { status } = await call('POST', '/seller-applications', {
      token: shopper,
      body: { ...application, description: 'stuff' },
    });

    expect(status).toBe(400);
  });

  it('creates the seller account and grants the role on approval', async () => {
    const pending = db().applications[0]!;

    const approved = await call<SellerApplication>(
      'POST',
      `/seller-applications/${pending.id}/approve`,
      { token: admin },
    );

    expect(approved.data.status).toBe('approved');
    expect(approved.data.sellerId).not.toBeNull();

    const me = await call<User>('GET', '/auth/me', { token: applicant });
    expect(me.data.roles).toContain('seller');
    expect(me.data.sellerId).toBe(approved.data.sellerId);

    const sellers = await call<Paginated<Seller>>('GET', '/sellers', {
      token: admin,
    });
    expect(
      sellers.data.items.find((s) => s.id === approved.data.sellerId)?.status,
    ).toBe('approved');
  });

  it('lets a newly approved seller trade immediately', async () => {
    const pending = db().applications[0]!;
    await call('POST', `/seller-applications/${pending.id}/approve`, {
      token: admin,
    });

    const sku = db().products[4]!.variants[0]!.sku;
    const { status, data } = await call<Offer>('POST', '/offers', {
      token: applicant,
      body: { skuId: sku.id, price: '55.00', status: 'active' },
    });

    expect(status).toBe(201);
    expect(data.sellerName).toBe('Pinemoor Trading');
  });

  it('records the reason on rejection and grants nothing', async () => {
    const pending = db().applications[0]!;

    const rejected = await call<SellerApplication>(
      'POST',
      `/seller-applications/${pending.id}/reject`,
      {
        token: admin,
        body: { reason: 'Company details could not be verified.' },
      },
    );

    expect(rejected.data.status).toBe('rejected');
    expect(rejected.data.rejectionReason).toBe(
      'Company details could not be verified.',
    );

    const me = await call<User>('GET', '/auth/me', { token: applicant });
    expect(me.data.roles).not.toContain('seller');
    expect(me.data.sellerId).toBeNull();
  });

  it('requires a reason to reject', async () => {
    const pending = db().applications[0]!;
    const { status } = await call(
      'POST',
      `/seller-applications/${pending.id}/reject`,
      { token: admin, body: { reason: '' } },
    );

    expect(status).toBe(400);
  });

  it('will not review the same application twice', async () => {
    const pending = db().applications[0]!;
    await call('POST', `/seller-applications/${pending.id}/approve`, {
      token: admin,
    });
    const { status } = await call(
      'POST',
      `/seller-applications/${pending.id}/reject`,
      { token: admin, body: { reason: 'Changed my mind.' } },
    );

    expect(status).toBe(409);
  });

  it('stops a shopper approving their own application', async () => {
    const pending = db().applications[0]!;
    const { status } = await call(
      'POST',
      `/seller-applications/${pending.id}/approve`,
      { token: applicant },
    );

    expect(status).toBe(403);
  });
});

describe('seller product submission', () => {
  const submission = {
    name: 'Deskworks cable tray',
    slug: 'deskworks-cable-tray',
    description: 'Under-desk steel cable management tray.',
    variants: [{ name: 'Black', skuCode: 'DW-TRAY-BLK' }],
  };

  it('lands as pending, attributed to the seller', async () => {
    const { status, data } = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: submission,
    });

    expect(status).toBe(201);
    expect(data.status).toBe('pending');
    expect(data.submittedBySellerName).toBe('Deskworks');
  });

  it('cannot publish itself by asking for active', async () => {
    const { status } = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: { ...submission, status: 'active' },
    });

    // The schema only admits draft or pending, so this is refused outright
    // rather than quietly downgraded.
    expect(status).toBe(400);
  });

  it('can be held back as a draft', async () => {
    const { data } = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: { ...submission, status: 'draft' },
    });

    expect(data.status).toBe('draft');
  });

  it('is visible to its submitter but not to another seller', async () => {
    await call('POST', '/seller/products', { token: seller, body: submission });
    const harbour = (await signIn(ACCOUNTS.harbour)).token;

    const mine = await call<Paginated<Product>>(
      'GET',
      '/products?q=cable tray',
      {
        token: seller,
      },
    );
    expect(mine.data.total).toBe(1);

    const theirs = await call<Paginated<Product>>(
      'GET',
      '/products?q=cable tray',
      { token: harbour },
    );
    expect(theirs.data.total).toBe(0);
  });

  it('goes live once an admin approves it', async () => {
    const created = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: submission,
    });

    const approved = await call<Product>(
      'POST',
      `/products/${created.data.id}/approve`,
      { token: admin },
    );

    expect(approved.data.status).toBe('active');
    expect(approved.data.submittedBySellerName).toBe('Deskworks');
  });

  it('carries the reason back to the seller on rejection', async () => {
    const created = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: submission,
    });

    const rejected = await call<Product>(
      'POST',
      `/products/${created.data.id}/reject`,
      { token: admin, body: { reason: 'Needs a clearer product photo.' } },
    );

    expect(rejected.data.status).toBe('rejected');
    expect(rejected.data.rejectionReason).toBe(
      'Needs a clearer product photo.',
    );
  });

  it('will not approve a product that is not pending', async () => {
    const live = db().products.find((p) => p.status === 'active')!;
    const { status } = await call('POST', `/products/${live.id}/approve`, {
      token: admin,
    });

    expect(status).toBe(409);
  });
});
