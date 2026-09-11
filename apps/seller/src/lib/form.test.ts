import { ApiError, ApiUnreachableError } from '@commerce/api-client';
import { describe, expect, it } from 'vitest';

import { toFormState } from './form';

function apiError(body: unknown, status = 400): ApiError {
  return new ApiError('failed', {
    status,
    requestId: 'req-1',
    body: body as never,
  });
}

describe('toFormState', () => {
  it('splits `field: message` errors onto their field', () => {
    const state = toFormState(
      apiError({ message: ['name: Name is required.', 'slug: Bad slug.'] }),
    );

    expect(state.status).toBe('error');
    expect(state.fieldErrors).toEqual({
      name: ['Name is required.'],
      slug: ['Bad slug.'],
    });
    expect(state.message).toBeUndefined();
  });

  it('groups several messages for one field', () => {
    const state = toFormState(
      apiError({ message: ['price: Too low.', 'price: Wrong format.'] }),
    );

    expect(state.fieldErrors?.price).toEqual(['Too low.', 'Wrong format.']);
  });

  it('keeps an unprefixed message at form level', () => {
    const state = toFormState(
      apiError({ message: 'Slug is already used.' }, 409),
    );

    expect(state.message).toBe('Slug is already used.');
    expect(state.fieldErrors).toBeUndefined();
  });

  it('handles a mix of field and form messages', () => {
    const state = toFormState(
      apiError({ message: ['Something broke.', 'name: Required.'] }),
    );

    expect(state.message).toBe('Something broke.');
    expect(state.fieldErrors).toEqual({ name: ['Required.'] });
  });

  it('reports an unreachable API in plain language', () => {
    const state = toFormState(
      new ApiUnreachableError('boom', { requestId: 'r', cause: null }),
    );

    expect(state.message).toContain('Could not reach the Commerce API');
  });

  it('falls back for an unexpected error', () => {
    expect(toFormState(new Error('kaboom')).message).toBe('kaboom');
    expect(toFormState('nope').message).toBe('Something went wrong.');
  });
});
