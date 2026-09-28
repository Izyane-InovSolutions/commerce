/**
 * Reading the password forms — change (signed in) and reset (from an emailed
 * link) — into the bodies the API's DTOs take, with the checks it would make
 * anyway run first so a typo is caught without a round trip.
 */

/** The API's `@MinLength(8)` on every new password. */
export const MIN_PASSWORD_LENGTH = 8;

/** Shown after any accepted reset request, whether or not the address has an
 * account. The link lasts an hour (`PASSWORD_RESET_TOKEN_TTL_SECONDS`). */
export const PASSWORD_RESET_SENT_MESSAGE =
  'If an account exists for that email, a link to reset its password is on its way. The link works for one hour.';

type Parsed<T> =
  | { ok: true; body: T }
  | { ok: false; fieldErrors: Record<string, string[]> };

function newPasswordErrors(formData: FormData): Record<string, string[]> {
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');
  const fieldErrors: Record<string, string[]> = {};

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.newPassword = [
      `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    ];
  }
  if (confirm !== newPassword) {
    fieldErrors.confirmPassword = ['The two passwords don’t match.'];
  }
  return fieldErrors;
}

export function passwordChangeFromFormData(
  formData: FormData,
): Parsed<{ currentPassword: string; newPassword: string }> {
  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  const fieldErrors = newPasswordErrors(formData);

  if (currentPassword === '') {
    fieldErrors.currentPassword = ['Enter your current password.'];
  } else if (
    newPassword === currentPassword &&
    fieldErrors.newPassword === undefined
  ) {
    fieldErrors.newPassword = ['Choose a password you aren’t using now.'];
  }

  return Object.keys(fieldErrors).length > 0
    ? { ok: false, fieldErrors }
    : { ok: true, body: { currentPassword, newPassword } };
}

export function passwordResetFromFormData(
  formData: FormData,
): Parsed<{ token: string; newPassword: string }> {
  const token = String(formData.get('token') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  const fieldErrors = newPasswordErrors(formData);

  if (token === '') {
    fieldErrors.token = ['This reset link is incomplete.'];
  }

  return Object.keys(fieldErrors).length > 0
    ? { ok: false, fieldErrors }
    : { ok: true, body: { token, newPassword } };
}
