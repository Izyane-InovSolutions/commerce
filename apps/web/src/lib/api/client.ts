import { env } from '@/lib/env';

import {
  ApiError,
  ApiUnreachableError,
  formatApiErrorMessage,
  type ApiErrorBody,
} from './errors';

export type QueryValue = string | number | boolean | null | undefined;

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Serialised as JSON. Omit for requests without a body. */
  body?: unknown;
  /** Appended as a query string; `null` and `undefined` entries are dropped. */
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  /**
   * Idempotency key for sensitive mutations. The API deduplicates retries that
   * carry the same key, so callers must reuse one key across retries of the
   * same logical request.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
  cache?: RequestCache;
  next?: NextFetchRequestConfig;
};

function buildUrl(path: string, query: ApiRequestOptions['query']): string {
  const url = new URL(
    `${env.apiBaseUrl}/${path.replace(/^\/+/, '')}`.replace(/\/+$/, ''),
  );

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Performs a request against the Commerce API.
 *
 * Every call carries a correlation id so a client-side failure can be traced
 * to the matching API log entry.
 *
 * @throws {ApiError} when the API answers with a non-2xx status.
 * @throws {ApiUnreachableError} when the API cannot be reached.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    query,
    headers,
    idempotencyKey,
    signal,
    cache,
    next,
  } = options;

  const requestId = crypto.randomUUID();
  const requestHeaders: Record<string, string> = {
    accept: 'application/json',
    'x-request-id': requestId,
    ...headers,
  };

  if (body !== undefined) {
    requestHeaders['content-type'] = 'application/json';
  }

  if (idempotencyKey !== undefined) {
    requestHeaders['idempotency-key'] = idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache,
      next,
    });
  } catch (cause) {
    throw new ApiUnreachableError(
      `Could not reach the Commerce API at ${env.apiBaseUrl}.`,
      { requestId, cause },
    );
  }

  const payload = await readBody(response);

  if (!response.ok) {
    const errorBody =
      typeof payload === 'object' && payload !== null
        ? (payload as ApiErrorBody)
        : null;

    throw new ApiError(
      formatApiErrorMessage(
        errorBody,
        `Request to ${method} ${path} failed with status ${response.status}.`,
      ),
      {
        status: response.status,
        requestId,
        body: errorBody,
      },
    );
  }

  return payload as T;
}
