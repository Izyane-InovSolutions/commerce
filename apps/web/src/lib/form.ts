import { ApiError, ApiUnreachableError } from '@commerce/api-client';

/** Result of a server action, rendered back into the form that submitted it. */
export type FormState = {
  status: 'idle' | 'error';
  message?: string;
  /** Messages keyed by field name, as produced by the API or by validation. */
  fieldErrors?: Record<string, string[]>;
};

export const idleFormState: FormState = { status: 'idle' };

type ErrorEnvelope = {
  error?: {
    message?: string;
    details?: { field?: string; message: string }[];
  };
};

/**
 * Turns a failed request into form state.
 *
 * The Commerce API reports errors as `{ error: { message, details } }`,
 * where each detail may carry the field it belongs to (see
 * `services/commerce-api/src/common/http/validation-exception.ts`).
 */
export function toFormState(error: unknown): FormState {
  if (error instanceof ApiUnreachableError) {
    return {
      status: 'error',
      message: 'Could not reach the Commerce API. Try again in a moment.',
    };
  }

  if (error instanceof ApiError) {
    const body = error.body as unknown as ErrorEnvelope | null;
    const details = body?.error?.details ?? [];
    const fieldErrors: Record<string, string[]> = {};
    const formMessages: string[] = [];

    for (const detail of details) {
      if (detail.field) {
        (fieldErrors[detail.field] ??= []).push(detail.message);
      } else {
        formMessages.push(detail.message);
      }
    }

    const hasFieldErrors = Object.keys(fieldErrors).length > 0;

    return {
      status: 'error',
      message:
        formMessages.length > 0
          ? formMessages.join(' ')
          : hasFieldErrors
            ? undefined
            : (body?.error?.message ?? error.message),
      fieldErrors: hasFieldErrors ? fieldErrors : undefined,
    };
  }

  return {
    status: 'error',
    message: error instanceof Error ? error.message : 'Something went wrong.',
  };
}
