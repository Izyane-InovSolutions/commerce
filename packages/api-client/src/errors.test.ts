import { describe, expect, it } from 'vitest';

import {
  extractFieldErrors,
  formatApiErrorMessage,
  parseApiError,
} from './errors';

describe('formatApiErrorMessage', () => {
  it('reads the message out of the Commerce API`s nested error object', () => {
    const message = formatApiErrorMessage(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } },
      'fallback',
    );

    expect(message).toBe('Invalid email or password');
  });

  it('never hands an object to the caller, even if the nested message is missing', () => {
    // This is the exact failure mode that showed up in practice: an object
    // reaching a string context stringifies to the useless "[object Object]".
    const message = formatApiErrorMessage(
      { error: { code: 'UNAUTHORIZED' } },
      'fallback',
    );

    expect(message).toBe('fallback');
    expect(message).not.toContain('object Object');
  });

  it('joins the mock`s array of field messages', () => {
    const message = formatApiErrorMessage(
      { message: ['name: Name is required.', 'slug: Bad slug.'] },
      'fallback',
    );

    expect(message).toBe('name: Name is required., slug: Bad slug.');
  });

  it('reads the mock`s flat string message', () => {
    expect(
      formatApiErrorMessage({ message: 'Slug already used.' }, 'fallback'),
    ).toBe('Slug already used.');
  });

  it('reads the mock`s plain-string error as a last resort', () => {
    expect(formatApiErrorMessage({ error: 'Bad Request' }, 'fallback')).toBe(
      'Bad Request',
    );
  });

  it('falls back when there is no body at all', () => {
    expect(formatApiErrorMessage(null, 'fallback')).toBe('fallback');
  });
});

describe('extractFieldErrors', () => {
  it('reads the Commerce API`s details array', () => {
    const fieldErrors = extractFieldErrors({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid',
        details: [
          {
            field: 'name',
            message: 'name must be longer than or equal to 1 characters',
          },
          { field: 'slug', message: 'must be a lowercase kebab-case slug' },
        ],
      },
    });

    expect(fieldErrors).toEqual({
      name: ['name must be longer than or equal to 1 characters'],
      slug: ['must be a lowercase kebab-case slug'],
    });
  });

  it('groups several Commerce API messages for one field', () => {
    const fieldErrors = extractFieldErrors({
      error: {
        details: [
          { field: 'price', message: 'Too low.' },
          { field: 'price', message: 'Wrong format.' },
        ],
      },
    });

    expect(fieldErrors?.price).toEqual(['Too low.', 'Wrong format.']);
  });

  it('drops a detail with no field, as a form-level message', () => {
    const fieldErrors = extractFieldErrors({
      error: { details: [{ message: 'Something broke.' }] },
    });

    expect(fieldErrors).toBeUndefined();
  });

  it('parses the mock`s `field: message` strings', () => {
    const fieldErrors = extractFieldErrors({
      message: ['name: Name is required.', 'slug: Bad slug.'],
    });

    expect(fieldErrors).toEqual({
      name: ['Name is required.'],
      slug: ['Bad slug.'],
    });
  });

  it('returns undefined rather than an empty object when nothing is per-field', () => {
    expect(
      extractFieldErrors({ message: 'Slug already used.' }),
    ).toBeUndefined();
    expect(extractFieldErrors(null)).toBeUndefined();
  });
});

describe('parseApiError', () => {
  it('attributes a Commerce API sign-in failure to the form, not a field', () => {
    // Captured live from POST /auth/login with the wrong password.
    const parsed = parseApiError(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
          details: [],
        },
      },
      'fallback',
    );

    expect(parsed.message).toBe('Invalid email or password');
    expect(parsed.fieldErrors).toBeUndefined();
  });

  it('drops the Commerce API`s generic wrapper once field messages exist', () => {
    // Captured live from POST /admin/catalog/brands with a blank name.
    const parsed = parseApiError(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request is invalid',
          details: [
            {
              field: 'name',
              message: 'name must be longer than or equal to 1 characters',
            },
            { field: 'slug', message: 'must be a lowercase kebab-case slug' },
          ],
        },
      },
      'fallback',
    );

    // "The request is invalid" would tell the reader nothing the field
    // messages don't already say, so it is not shown twice.
    expect(parsed.message).toBeUndefined();
    expect(parsed.fieldErrors).toEqual({
      name: ['name must be longer than or equal to 1 characters'],
      slug: ['must be a lowercase kebab-case slug'],
    });
  });

  it('keeps every mock message that is not attributed to a field', () => {
    const parsed = parseApiError(
      { message: ['Something broke.', 'name: Required.'] },
      'fallback',
    );

    expect(parsed.message).toBe('Something broke.');
    expect(parsed.fieldErrors).toEqual({ name: ['Required.'] });
  });

  it('leaves no form message when every mock entry is field-tagged', () => {
    const parsed = parseApiError(
      { message: ['name: Name is required.', 'slug: Bad slug.'] },
      'fallback',
    );

    expect(parsed.message).toBeUndefined();
    expect(parsed.fieldErrors).toEqual({
      name: ['Name is required.'],
      slug: ['Bad slug.'],
    });
  });

  it('passes a flat mock message straight through', () => {
    const parsed = parseApiError(
      { message: 'Slug is already used.' },
      'fallback',
    );

    expect(parsed.message).toBe('Slug is already used.');
    expect(parsed.fieldErrors).toBeUndefined();
  });

  it('falls back to the caller`s message when there is no body', () => {
    expect(parseApiError(null, 'fallback').message).toBe('fallback');
  });
});
