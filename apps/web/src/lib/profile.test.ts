import { describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({ apiClient: {} }));

import { profileUpdateFromFormData } from './profile';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const blank = { firstName: null, lastName: null, phone: null };

describe('profileUpdateFromFormData', () => {
  it('sends only what changed', () => {
    expect(
      profileUpdateFromFormData(
        form({ firstName: 'Ada', lastName: 'Lovelace', phone: '' }),
        { firstName: 'Ada', lastName: null, phone: null },
      ),
    ).toEqual({ ok: true, update: { lastName: 'Lovelace' } });
  });

  it('leaves out names that were never set and are still empty', () => {
    expect(
      profileUpdateFromFormData(
        form({ firstName: '', lastName: '', phone: '' }),
        blank,
      ),
    ).toEqual({ ok: true, update: {} });
  });

  it('refuses to blank a name once set', () => {
    const result = profileUpdateFromFormData(
      form({ firstName: '  ', lastName: 'Lovelace', phone: '' }),
      { firstName: 'Ada', lastName: 'Lovelace', phone: null },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors.firstName).toBeTruthy();
  });

  it('strips spaces from a phone number, and lets it be cleared', () => {
    expect(
      profileUpdateFromFormData(form({ phone: '097 123 4567' }), blank),
    ).toEqual({ ok: true, update: { phone: '0971234567' } });
    expect(
      profileUpdateFromFormData(form({ phone: '' }), {
        ...blank,
        phone: '0971234567',
      }),
    ).toEqual({ ok: true, update: { phone: '' } });
  });
});
