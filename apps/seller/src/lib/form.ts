import { ApiError, ApiUnreachableError } from '@commerce/api-client';

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
 * The API reports validation failures as `field: message` strings, so those
 * are split back out and attached to the field that caused them; anything else
 * becomes a form-level message.
 */
export function toFormState(error: unknown): FormState {
  if (error instanceof ApiUnreachableError) {
    return {
      status: 'error',
      message: 'Could not reach the Commerce API. Try again in a moment.',
    };
  }

  if (error instanceof ApiError) {
    const raw = error.body?.message;
    const messages = Array.isArray(raw) ? raw : raw ? [raw] : [error.message];
    const fieldErrors: Record<string, string[]> = {};
    const formMessages: string[] = [];

    for (const message of messages) {
      const match = /^([A-Za-z0-9_.[\]]+):\s*(.+)$/.exec(message);
      if (match) {
        const field = match[1]!;
        (fieldErrors[field] ??= []).push(match[2]!);
      } else {
        formMessages.push(message);
      }
    }

    return {
      status: 'error',
      message: formMessages.length > 0 ? formMessages.join(' ') : undefined,
      fieldErrors:
        Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    };
  }

  return {
    status: 'error',
    message: error instanceof Error ? error.message : 'Something went wrong.',
  };
}
