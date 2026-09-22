import type { z } from 'zod';

import type { RawSearchParams } from './search-params';

/**
 * Validates URL query parameters against a contract schema.
 *
 * Anything a user can edit in the address bar reaches the page, so unusable
 * values fall back to the schema's defaults rather than failing the render.
 * Blank values are dropped first, because an HTML filter form posts every
 * field including the ones left empty.
 */
export function parseQueryParams<T extends z.ZodType>(
  schema: T,
  params: RawSearchParams,
): z.output<T> {
  const raw: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined && single !== '') {
      raw[key] = single;
    }
  }

  const result = schema.safeParse(raw);
  return result.success ? result.data : (schema.parse({}) as z.output<T>);
}
