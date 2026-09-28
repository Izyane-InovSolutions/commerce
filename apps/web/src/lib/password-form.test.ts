import { describe, expect, it } from 'vitest';

import {
  passwordChangeFromFormData,
  passwordResetFromFormData,
} from './password-form';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe('passwordChangeFromFormData', () => {
  it('builds the body the API takes', () => {
    expect(
      passwordChangeFromFormData(
        form({
          currentPassword: 'old-password',
          newPassword: 'new-password',
          confirmPassword: 'new-password',
        }),
      ),
    ).toEqual({
      ok: true,
      body: { currentPassword: 'old-password', newPassword: 'new-password' },
    });
  });

  it('asks for the current password', () => {
    const result = passwordChangeFromFormData(
      form({ newPassword: 'new-password', confirmPassword: 'new-password' }),
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors.currentPassword).toBeTruthy();
  });

  it('refuses a short, mismatched or unchanged new password', () => {
    const short = passwordChangeFromFormData(
      form({
        currentPassword: 'old-password',
        newPassword: 'short',
        confirmPassword: 'short',
      }),
    );
    expect(!short.ok && short.fieldErrors.newPassword).toBeTruthy();

    const mismatched = passwordChangeFromFormData(
      form({
        currentPassword: 'old-password',
        newPassword: 'new-password',
        confirmPassword: 'new-passwrod',
      }),
    );
    expect(
      !mismatched.ok && mismatched.fieldErrors.confirmPassword,
    ).toBeTruthy();

    const unchanged = passwordChangeFromFormData(
      form({
        currentPassword: 'same-password',
        newPassword: 'same-password',
        confirmPassword: 'same-password',
      }),
    );
    expect(!unchanged.ok && unchanged.fieldErrors.newPassword).toBeTruthy();
  });
});

describe('passwordResetFromFormData', () => {
  it('builds the body the API takes', () => {
    expect(
      passwordResetFromFormData(
        form({
          token: 'tok',
          newPassword: 'new-password',
          confirmPassword: 'new-password',
        }),
      ),
    ).toEqual({ ok: true, body: { token: 'tok', newPassword: 'new-password' } });
  });

  it('refuses a missing token or a mismatched confirmation', () => {
    const result = passwordResetFromFormData(
      form({ newPassword: 'new-password', confirmPassword: 'other-password' }),
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.fieldErrors).sort()).toEqual([
      'confirmPassword',
      'token',
    ]);
  });
});
