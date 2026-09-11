/**
 * Local mirror of `services/commerce-api`'s actual auth response shapes.
 *
 * These intentionally differ from `@commerce/contracts`' `User`/`Session`
 * types (that contract matches the mock API, not this backend yet): a real
 * account has one `role`, not a `roles` list, and no `name`.
 */
export type Role = 'CUSTOMER' | 'SELLER' | 'STAFF' | 'ADMIN';

export type PublicUser = {
  id: string;
  email: string;
  role: Role;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicUser;
};

/** Every response from the Commerce API is wrapped like this. */
export type SuccessEnvelope<T> = {
  data: T;
  meta: { requestId: string };
};
