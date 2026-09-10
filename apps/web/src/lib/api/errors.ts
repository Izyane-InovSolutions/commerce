/**
 * Error shape returned by the Commerce API's exception filters.
 */
export type ApiErrorBody = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

/**
 * Raised when the Commerce API answers with a non-2xx status.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly requestId: string;
  readonly body: ApiErrorBody | null;

  constructor(
    message: string,
    options: { status: number; requestId: string; body: ApiErrorBody | null },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.requestId = options.requestId;
    this.body = options.body;
  }
}

/**
 * Raised when the Commerce API could not be reached at all.
 */
export class ApiUnreachableError extends Error {
  readonly requestId: string;

  constructor(message: string, options: { requestId: string; cause: unknown }) {
    super(message, { cause: options.cause });
    this.name = 'ApiUnreachableError';
    this.requestId = options.requestId;
  }
}

/**
 * Turns an API error body into a single human-readable message.
 */
export function formatApiErrorMessage(
  body: ApiErrorBody | null,
  fallback: string,
): string {
  if (!body) {
    return fallback;
  }

  if (Array.isArray(body.message)) {
    return body.message.join(', ');
  }

  return body.message ?? body.error ?? fallback;
}
