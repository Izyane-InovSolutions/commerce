import type { Role, Session, User } from '@commerce/contracts';

import { MockHttpError } from './http.ts';
import { id } from './id.ts';
import { db } from './store.ts';

/**
 * Mock authentication.
 *
 * NOT a real authentication system. Passwords are compared in plain text and
 * sessions live in memory. It exists so the clients can build against real
 * session and role behaviour; the NestJS auth module replaces all of it.
 */

export type MockUser = User & { password: string };

const SESSION_DAYS = 7;

export function findUserByEmail(email: string): MockUser | undefined {
  const normalised = email.trim().toLowerCase();
  return db().users.find((user) => user.email.toLowerCase() === normalised);
}

function toUser(user: MockUser): User {
  const { password: _password, ...rest } = user;
  void _password;
  return rest;
}

export function createSession(user: MockUser): Session {
  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const token = id(`session:${user.id}:${db().sessions.length}:${Date.now()}`);

  db().sessions.push({ token, userId: user.id, expiresAt });
  return { token, expiresAt, user: toUser(user) };
}

export function destroySession(token: string): void {
  const store = db();
  store.sessions = store.sessions.filter((session) => session.token !== token);
}

/** Resolves the bearer token on a request to a user, if it is still valid. */
export function userFromRequest(request: Request): User | null {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return null;
  }

  const session = db().sessions.find((candidate) => candidate.token === token);
  if (!session || Date.parse(session.expiresAt) < Date.now()) {
    return null;
  }

  const user = db().users.find((candidate) => candidate.id === session.userId);
  return user ? toUser(user) : null;
}

export function requireUser(user: User | null): User {
  if (!user) {
    throw new MockHttpError(401, 'Sign in to continue.');
  }
  return user;
}

export function requireRole(user: User | null, role: Role): User {
  const authenticated = requireUser(user);
  if (!authenticated.roles.includes(role)) {
    throw new MockHttpError(403, `This action needs the ${role} role.`);
  }
  return authenticated;
}

/**
 * The seller account the caller may act for.
 *
 * A seller is pinned to their own account. An admin may act for any seller by
 * naming one, which is how support and moderation work.
 */
export function requireSellerScope(
  user: User | null,
  requestedSellerId: string | undefined,
): string {
  const authenticated = requireUser(user);

  if (authenticated.roles.includes('admin')) {
    if (!requestedSellerId) {
      throw new MockHttpError(400, 'Name the seller to act for.');
    }
    return requestedSellerId;
  }

  if (!authenticated.roles.includes('seller') || !authenticated.sellerId) {
    throw new MockHttpError(
      403,
      'This action needs an approved seller account.',
    );
  }

  if (requestedSellerId && requestedSellerId !== authenticated.sellerId) {
    throw new MockHttpError(
      403,
      'You can only act for your own seller account.',
    );
  }

  const seller = db().sellers.find(
    (candidate) => candidate.id === authenticated.sellerId,
  );
  if (seller?.status !== 'approved') {
    throw new MockHttpError(
      403,
      'Your seller account is not approved for trading.',
    );
  }

  return authenticated.sellerId;
}

export function verifyPassword(user: MockUser, password: string): void {
  if (user.password !== password) {
    throw new MockHttpError(401, 'That email and password do not match.');
  }
}
