/**
 * Error shape an exception filter can answer with.
 *
 * The mock API and the real Commerce API disagree on shape, so both are
 * described here and every reader goes through the helpers below rather than
 * reaching into the body directly — reach in once, and the next shape change
 * only has to be fixed in one place again.
 */
export type ApiErrorDetail = {
  field?: string;
  message: string;
};

export type ApiErrorBody = {
  /**
   * The Commerce API's shape: a nested object carrying the human-readable
   * message and, for a validation failure, one entry per field.
   */
  error?:
    | string
    | { code?: string; message?: string; details?: ApiErrorDetail[] };
  /**
   * The mock API's shape: a flat message, or one string per field formatted
   * as `"field: message"`, possibly mixed with plain form-level strings.
   */
  message?: string | string[];
  statusCode?: number;
};

/** Matches the mock API's `"field: message"` convention. */
const FIELD_MESSAGE_PATTERN = /^([A-Za-z0-9_.[\]]+):\s*(.+)$/;

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
 * Turns an API error body into a single human-readable message, with no
 * awareness of which parts are field-specific.
 *
 * On the Commerce API, the message lives at `error.message`. On the mock, it
 * is the top-level `message` (or `error` as a plain string). Checking the
 * nested-object case first matters: an object there must never be handed to
 * `Error`'s constructor, which stringifies anything non-string to the useless
 * `"[object Object]"`.
 *
 * A form that wants to keep field errors separate from the form-level message
 * should use `parseApiError` instead — this one folds everything into one
 * string, which is right for a page-level notice but loses that split.
 */
export function formatApiErrorMessage(
  body: ApiErrorBody | null,
  fallback: string,
): string {
  if (!body) {
    return fallback;
  }

  if (typeof body.error === 'object' && body.error !== null) {
    return body.error.message ?? fallback;
  }

  if (Array.isArray(body.message)) {
    return body.message.join(', ');
  }

  return body.message ?? body.error ?? fallback;
}

/**
 * Pulls per-field validation messages out of an error body, in whichever of
 * the two shapes it arrived in.
 */
export function extractFieldErrors(
  body: ApiErrorBody | null,
): Record<string, string[]> | undefined {
  if (!body) {
    return undefined;
  }

  const fieldErrors: Record<string, string[]> = {};

  if (typeof body.error === 'object' && body.error?.details) {
    for (const detail of body.error.details) {
      if (detail.field) {
        (fieldErrors[detail.field] ??= []).push(detail.message);
      }
    }
  }

  if (Array.isArray(body.message)) {
    for (const entry of body.message) {
      const match = FIELD_MESSAGE_PATTERN.exec(entry);
      if (match) {
        (fieldErrors[match[1]!] ??= []).push(match[2]!);
      }
    }
  }

  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
}

export type ParsedApiError = {
  /** Content that is not attributed to any one field. */
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

/**
 * Splits an error body into a form-level message and per-field messages, so a
 * form can show each next to the input it belongs to without also repeating
 * it in a banner.
 *
 * The two shapes need different rules:
 *
 * - The Commerce API's top-level `error.message` is boilerplate ("The
 *   request is invalid") whenever `details` is present — the field messages
 *   already say everything it would, so it is dropped in that case. With no
 *   `details`, there is nothing to attribute it to, so it is kept.
 * - The mock's `message` array can freely mix plain strings with
 *   `"field: message"` strings in one list; each entry goes to exactly one
 *   side of the split, and either side may end up empty.
 */
export function parseApiError(
  body: ApiErrorBody | null,
  fallback: string,
): ParsedApiError {
  if (!body) {
    return { message: fallback };
  }

  const fieldErrors = extractFieldErrors(body);

  if (typeof body.error === 'object' && body.error !== null) {
    return {
      message: fieldErrors ? undefined : (body.error.message ?? fallback),
      fieldErrors,
    };
  }

  if (Array.isArray(body.message)) {
    const leftover = body.message.filter(
      (entry) => !FIELD_MESSAGE_PATTERN.test(entry),
    );
    return {
      message: leftover.length > 0 ? leftover.join(' ') : undefined,
      fieldErrors,
    };
  }

  return {
    message:
      body.message ??
      (typeof body.error === 'string' ? body.error : undefined) ??
      fallback,
    fieldErrors,
  };
}
