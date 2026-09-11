import type { Paginated } from '@commerce/contracts';
import type { z } from 'zod';

/** Mirrors the error body a NestJS exception filter produces. */
export class MockHttpError extends Error {
  readonly status: number;
  readonly messages: string[];

  constructor(status: number, messages: string | string[]) {
    const list = Array.isArray(messages) ? messages : [messages];
    super(list.join(', '));
    this.name = 'MockHttpError';
    this.status = status;
    this.messages = list;
  }
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
};

export function errorResponse(error: MockHttpError): Response {
  return Response.json(
    {
      statusCode: error.status,
      message: error.messages.length === 1 ? error.messages[0] : error.messages,
      error: STATUS_TEXT[error.status] ?? 'Error',
    },
    { status: error.status },
  );
}

/** Validates a payload, reporting failures the way the API's pipes do. */
export function parseBody<T extends z.ZodType>(
  schema: T,
  payload: unknown,
): z.output<T> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new MockHttpError(
      400,
      result.error.issues.map((issue) =>
        issue.path.length > 0
          ? `${issue.path.join('.')}: ${issue.message}`
          : issue.message,
      ),
    );
  }

  return result.data;
}

/** Validates query parameters, ignoring blank values from HTML forms. */
export function parseQuery<T extends z.ZodType>(
  schema: T,
  url: URL,
): z.output<T> {
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (value !== '') {
      raw[key] = value;
    }
  }

  return parseBody(schema, raw);
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): Paginated<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  };
}

export function matches(haystack: string, needle: string | undefined): boolean {
  return (
    needle === undefined ||
    haystack.toLowerCase().includes(needle.toLowerCase())
  );
}
