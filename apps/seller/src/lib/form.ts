import {
  ApiError,
  ApiUnreachableError,
  parseApiError,
} from '@commerce/api-client';

/** Result of a server action, rendered back into the form that submitted it. */
export type FormState = {
  status: 'idle' | 'error';
  message?: string;
  /** Messages keyed by field name, as produced by the API or by validation. */
  fieldErrors?: Record<string, string[]>;
};

export const idleFormState: FormState = { status: 'idle' };

/**
 * Turns a failed request into form state.
 *
 * The API and the mock disagree on error shape, so the split between a
 * form-level message and per-field messages is computed once in
 * `@commerce/api-client` — this just wires the result into a `FormState`.
 */
export function toFormState(error: unknown): FormState {
  if (error instanceof ApiUnreachableError) {
    return {
      status: 'error',
      message: 'Could not reach the Commerce API. Try again in a moment.',
    };
  }

  if (error instanceof ApiError) {
    const parsed = parseApiError(error.body, error.message);
    return {
      status: 'error',
      message: parsed.message,
      fieldErrors: parsed.fieldErrors,
    };
  }

  return {
    status: 'error',
    message: error instanceof Error ? error.message : 'Something went wrong.',
  };
}
