import type { Role, User } from '@commerce/contracts';

/** What a route needs from the caller before it will run. */
export type RouteAuth = 'public' | 'authenticated' | Role[];

export type RouteContext = {
  params: Record<string, string>;
  url: URL;
  body: unknown;
  request: Request;
  /** The signed-in user, or null. Already checked against `auth`. */
  user: User | null;
};

export type Route = {
  method: string;
  /** Path pattern with `:name` placeholders, e.g. `/products/:id`. */
  pattern: string;
  auth: RouteAuth;
  /**
   * Returns the value to serialise as JSON, or a `Response` to send as-is
   * when the endpoint serves something other than JSON.
   */
  handle: (context: RouteContext) => unknown | Promise<unknown>;
};
