import type { Session } from '@commerce/contracts';

import { handleMockRequest } from './router.ts';
import { SEED_PASSWORD } from './seed.ts';

/** Seeded accounts, by the role they exercise. */
export const ACCOUNTS = {
  admin: 'admin@commerce.test',
  deskworks: 'seller@deskworks.test',
  harbour: 'seller@harboursupply.test',
  shopper: 'shopper@example.test',
  applicant: 'applicant@pinemoor.test',
} as const;

export type CallResult<T> = { status: number; data: T };

/** Issues one request against the mock, optionally as a signed-in user. */
export async function call<T>(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
): Promise<CallResult<T>> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.token !== undefined) {
    headers.authorization = `Bearer ${options.token}`;
  }

  const response = await handleMockRequest(
    new Request(`http://localhost/api/v1${path}`, {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    path.split('?')[0]!,
  );

  // A 204 carries no body, the same way the real client handles it.
  const text = await response.text();
  return {
    status: response.status,
    data: (text.length === 0 ? null : JSON.parse(text)) as T,
  };
}

export async function signIn(email: string): Promise<Session> {
  const { data, status } = await call<Session>('POST', '/auth/sign-in', {
    body: { email, password: SEED_PASSWORD },
  });

  if (status !== 201) {
    throw new Error(`Could not sign in as ${email}: ${JSON.stringify(data)}`);
  }

  return data;
}

export async function tokenFor(email: string): Promise<string> {
  return (await signIn(email)).token;
}
