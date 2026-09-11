import {
  ApiError,
  ApiUnreachableError,
  formatApiErrorMessage,
  type ApiErrorBody,
} from './errors';

export type QueryValue = string | number | boolean | null | undefined;

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type ApiRequestOptions = {
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
  /** Next.js fetch cache options, ignored outside a Next.js runtime. */
  next?: { revalidate?: number | false; tags?: string[] };
};

export type ApiClientOptions = {
  /** Base URL of the Commerce API, including the `/api/v1` prefix. */
  baseUrl: string;
  /**
   * Unwrap the `{ data, meta }` envelope the Commerce API wraps every
   * response in, so callers receive the payload itself.
   *
   * Off by default because the stand-in mock returns payloads directly.
   */
  envelope?: boolean;
  /**
   * Resolves headers to attach to every request, such as an `authorization`
   * header. Called per request so a rotated token is always picked up.
   */
  getAuthHeaders?: () =>
    | Record<string, string>
    | Promise<Record<string, string>>;
};

export type ApiClient = {
  readonly baseUrl: string;
  /** True when responses from this client are unwrapped from an envelope. */
  readonly envelope: boolean;
  request<T>(
    method: HttpMethod,
    path: string,
    options?: ApiRequestOptions,
  ): Promise<T>;
  get<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  post<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  patch<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  put<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  delete<T>(path: string, options?: ApiRequestOptions): Promise<T>;
};

function buildUrl(
  baseUrl: string,
  path: string,
  query: ApiRequestOptions['query'],
): string {
  const url = new URL(
    `${baseUrl}/${path.replace(/^\/+/, '')}`.replace(/\/+$/, ''),
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
 * Creates a client bound to one Commerce API base URL.
 *
 * Each client is a plain object, so an app can hold several — for example one
 * anonymous and one carrying a signed-in user's credentials.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  async function request<T>(
    method: HttpMethod,
    path: string,
    requestOptions: ApiRequestOptions = {},
  ): Promise<T> {
    const { body, query, headers, idempotencyKey, signal, cache, next } =
      requestOptions;

    const requestId = crypto.randomUUID();
    const requestHeaders: Record<string, string> = {
      accept: 'application/json',
      'x-request-id': requestId,
      ...(await options.getAuthHeaders?.()),
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
      response = await fetch(buildUrl(baseUrl, path, query), {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        cache,
        next,
      } as RequestInit);
    } catch (cause) {
      throw new ApiUnreachableError(
        `Could not reach the Commerce API at ${baseUrl}.`,
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
        { status: response.status, requestId, body: errorBody },
      );
    }

    return unwrap(payload) as T;
  }

  /**
   * Strips the response envelope.
   *
   * Only an object carrying exactly `data` and `meta` is treated as one, so a
   * paginated body — which is itself `{ data, meta }` — is returned intact
   * after the outer layer comes off.
   */
  function unwrap(payload: unknown): unknown {
    if (!options.envelope || payload === null || typeof payload !== 'object') {
      return payload;
    }

    const keys = Object.keys(payload);
    const enveloped =
      keys.length === 2 && keys.includes('data') && keys.includes('meta');

    return enveloped ? (payload as { data: unknown }).data : payload;
  }

  return {
    baseUrl,
    envelope: options.envelope === true,
    request,
    get: (path, requestOptions) => request('GET', path, requestOptions),
    post: (path, requestOptions) => request('POST', path, requestOptions),
    patch: (path, requestOptions) => request('PATCH', path, requestOptions),
    put: (path, requestOptions) => request('PUT', path, requestOptions),
    delete: (path, requestOptions) => request('DELETE', path, requestOptions),
  };
}
