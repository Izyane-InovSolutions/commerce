import {
  createSellerApplicationSchema,
  rejectSchema,
  sellerApplicationListQuerySchema,
  sellerListQuerySchema,
  signInSchema,
  signUpSchema,
  type SellerApplication,
  type User,
} from '@commerce/contracts';

import {
  createSession,
  destroySession,
  findUserByEmail,
  requireRole,
  requireUser,
  verifyPassword,
  type MockUser,
} from './auth.ts';
import {
  MockHttpError,
  matches,
  paginate,
  parseBody,
  parseQuery,
} from './http.ts';
import { id } from './id.ts';
import { db } from './store.ts';
import type { Route } from './types.ts';

function nowIso(): string {
  return new Date().toISOString();
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

function findApplication(applicationId: string): SellerApplication {
  const application = db().applications.find(
    (candidate) => candidate.id === applicationId,
  );
  if (!application) {
    throw new MockHttpError(404, `No application with id ${applicationId}.`);
  }
  return application;
}

function grantSellerRole(user: MockUser, sellerId: string): void {
  user.sellerId = sellerId;
  if (!user.roles.includes('seller')) {
    user.roles.push('seller');
  }
}

export const authRoutes: Route[] = [
  {
    method: 'POST',
    pattern: '/auth/sign-up',
    auth: 'public',
    handle: ({ body }) => {
      const input = parseBody(signUpSchema, body);
      if (findUserByEmail(input.email)) {
        throw new MockHttpError(
          409,
          'An account with that email already exists.',
        );
      }

      const user: MockUser = {
        id: id(`user:${input.email}`),
        email: input.email,
        name: input.name,
        // Everyone starts as a shopper. Selling is granted by approval.
        roles: ['customer'],
        sellerId: null,
        password: input.password,
        createdAt: nowIso(),
      };

      db().users.push(user);
      return createSession(user);
    },
  },

  {
    method: 'POST',
    pattern: '/auth/sign-in',
    auth: 'public',
    handle: ({ body }) => {
      const input = parseBody(signInSchema, body);
      const user = findUserByEmail(input.email);
      if (!user) {
        throw new MockHttpError(401, 'That email and password do not match.');
      }

      verifyPassword(user, input.password);
      return createSession(user);
    },
  },

  {
    method: 'POST',
    pattern: '/auth/sign-out',
    auth: 'public',
    handle: ({ request }) => {
      const token = bearer(request);
      if (token) {
        destroySession(token);
      }
      return { status: 'signed-out' };
    },
  },

  {
    method: 'GET',
    pattern: '/auth/me',
    auth: 'authenticated',
    handle: ({ user }) => requireUser(user),
  },

  {
    method: 'GET',
    pattern: '/seller-applications/mine',
    auth: 'authenticated',
    handle: ({ user }) => {
      const authenticated = requireUser(user);
      return (
        db()
          .applications.filter(
            (application) => application.userId === authenticated.id,
          )
          .sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt),
          )[0] ?? null
      );
    },
  },

  {
    method: 'POST',
    pattern: '/seller-applications',
    auth: 'authenticated',
    handle: ({ user, body }) => {
      const authenticated = requireUser(user);
      const input = parseBody(createSellerApplicationSchema, body);

      if (authenticated.sellerId) {
        throw new MockHttpError(409, 'You already have a seller account.');
      }

      const open = db().applications.find(
        (application) =>
          application.userId === authenticated.id &&
          application.status === 'pending',
      );
      if (open) {
        throw new MockHttpError(
          409,
          'Your application is already under review.',
        );
      }

      const slugTaken =
        db().sellers.some((seller) => seller.slug === input.slug) ||
        db().applications.some(
          (application) =>
            application.slug === input.slug && application.status === 'pending',
        );
      if (slugTaken) {
        throw new MockHttpError(
          409,
          `The store address ${input.slug} is taken.`,
        );
      }

      const application: SellerApplication = {
        id: id(`application:${input.slug}:${db().applications.length}`),
        userId: authenticated.id,
        userName: authenticated.name,
        userEmail: authenticated.email,
        displayName: input.displayName,
        slug: input.slug,
        contactEmail: input.contactEmail,
        description: input.description,
        status: 'pending',
        rejectionReason: null,
        sellerId: null,
        createdAt: nowIso(),
        reviewedAt: null,
      };

      db().applications.push(application);
      return application;
    },
  },

  {
    method: 'GET',
    pattern: '/seller-applications',
    auth: ['admin'],
    handle: ({ url }) => {
      const query = parseQuery(sellerApplicationListQuerySchema, url);
      const filtered = db()
        .applications.filter(
          (application) =>
            query.status === undefined || application.status === query.status,
        )
        // Pending first: the queue exists to be worked through.
        .sort(
          (left, right) =>
            Number(right.status === 'pending') -
              Number(left.status === 'pending') ||
            right.createdAt.localeCompare(left.createdAt),
        );

      return paginate(filtered, query.page, query.pageSize);
    },
  },

  {
    method: 'POST',
    pattern: '/seller-applications/:id/approve',
    auth: ['admin'],
    handle: ({ params }) => {
      const application = findApplication(params.id!);
      if (application.status !== 'pending') {
        throw new MockHttpError(
          409,
          'That application has already been reviewed.',
        );
      }

      const sellerId = id(`seller:${application.slug}`);
      db().sellers.push({
        id: sellerId,
        name: application.displayName,
        slug: application.slug,
        status: 'approved',
        // No logo until the seller uploads one; clients fall back to a monogram.
        logoUrl: null,
      });

      const applicant = db().users.find(
        (candidate) => candidate.id === application.userId,
      );
      if (applicant) {
        grantSellerRole(applicant, sellerId);
      }

      application.status = 'approved';
      application.sellerId = sellerId;
      application.reviewedAt = nowIso();
      return application;
    },
  },

  {
    method: 'POST',
    pattern: '/seller-applications/:id/reject',
    auth: ['admin'],
    handle: ({ params, body }) => {
      const application = findApplication(params.id!);
      if (application.status !== 'pending') {
        throw new MockHttpError(
          409,
          'That application has already been reviewed.',
        );
      }

      const input = parseBody(rejectSchema, body);
      application.status = 'rejected';
      application.rejectionReason = input.reason;
      application.reviewedAt = nowIso();
      return application;
    },
  },

  {
    method: 'GET',
    pattern: '/sellers/me',
    auth: 'authenticated',
    handle: ({ user }) => {
      const authenticated = requireUser(user);
      const seller = db().sellers.find(
        (candidate) => candidate.id === authenticated.sellerId,
      );
      if (!seller) {
        throw new MockHttpError(404, 'You do not have a seller account.');
      }
      return seller;
    },
  },

  {
    method: 'GET',
    pattern: '/sellers/:slug/logo.svg',
    auth: 'public',
    handle: ({ params }) => {
      const seller = db().sellers.find(
        (candidate) => candidate.slug === params.slug,
      );
      if (!seller) {
        throw new MockHttpError(404, 'No store at that address.');
      }

      return new Response(monogramSvg(seller.name), {
        headers: {
          'content-type': 'image/svg+xml',
          'cache-control': 'public, max-age=3600',
        },
      });
    },
  },

  {
    method: 'GET',
    pattern: '/sellers',
    auth: ['admin'],
    handle: ({ url }) => {
      const query = parseQuery(sellerListQuerySchema, url);
      const filtered = db()
        .sellers.filter(
          (seller) =>
            matches(seller.name, query.q) &&
            (query.status === undefined || seller.status === query.status),
        )
        .sort((left, right) => left.name.localeCompare(right.name));

      return paginate(filtered, query.page, query.pageSize);
    },
  },

  {
    method: 'POST',
    pattern: '/sellers/:id/suspend',
    auth: ['admin'],
    handle: ({ params }) => setSellerStatus(params.id!, 'suspended'),
  },

  {
    method: 'POST',
    pattern: '/sellers/:id/reinstate',
    auth: ['admin'],
    handle: ({ params }) => setSellerStatus(params.id!, 'approved'),
  },
];

/** Up to two initials, the way a person would abbreviate a store name. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /[A-Za-z0-9]/.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

/**
 * Stands in for an uploaded logo.
 *
 * The real platform stores logos in object storage; this generates a stable
 * monogram from the store name so the portals have a real image URL to load.
 */
function monogramSvg(name: string): string {
  // Hue derived from the name, so a store's colour never changes between runs.
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">',
    `<title>${name}</title>`,
    `<rect width="64" height="64" rx="14" fill="hsl(${hash} 45% 32%)"/>`,
    '<text x="32" y="33" fill="#fff" font-family="system-ui, sans-serif"',
    ' font-size="26" font-weight="600" text-anchor="middle"',
    ` dominant-baseline="central">${initials(name)}</text>`,
    '</svg>',
  ].join('');
}

function setSellerStatus(
  sellerId: string,
  status: 'approved' | 'suspended',
): unknown {
  const seller = db().sellers.find((candidate) => candidate.id === sellerId);
  if (!seller) {
    throw new MockHttpError(404, `No seller with id ${sellerId}.`);
  }

  seller.status = status;
  return seller;
}

/** Re-exported so the router can enforce roles without importing auth twice. */
export { requireRole };
export type { User };
