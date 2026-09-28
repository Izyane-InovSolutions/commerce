import { apiClient } from './api';
import type { Role, SuccessEnvelope } from './auth-types';

/**
 * The signed-in account's own profile — name and phone. Email, password and
 * everything else about signing in are the auth routes' business, not this.
 */
export type UserProfile = {
  id: string;
  email: string;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

/** Only the fields the API's `UpdateProfileDto` accepts — it rejects any
 * other key outright. */
export type ProfileUpdate = {
  firstName?: string;
  lastName?: string;
  phone?: string;
};

export async function getProfile(): Promise<UserProfile> {
  const response = await apiClient.get<SuccessEnvelope<UserProfile>>(
    '/users/me',
    { cache: 'no-store' },
  );
  return response.data;
}

export async function updateProfile(
  update: ProfileUpdate,
): Promise<UserProfile> {
  const response = await apiClient.patch<SuccessEnvelope<UserProfile>>(
    '/users/me',
    { body: update },
  );
  return response.data;
}

/**
 * Turns the settings form into an update the API will take.
 *
 * A name, once set, cannot be blanked — the API requires at least one
 * character — so clearing one is reported as a field error rather than
 * silently ignored. A name that was never set and is still empty is simply
 * left out. Phone can be cleared.
 */
export function profileUpdateFromFormData(
  formData: FormData,
  current: Pick<UserProfile, 'firstName' | 'lastName' | 'phone'>,
):
  | { ok: true; update: ProfileUpdate }
  | { ok: false; fieldErrors: Record<string, string[]> } {
  const read = (name: string) => String(formData.get(name) ?? '').trim();
  const update: ProfileUpdate = {};
  const fieldErrors: Record<string, string[]> = {};

  for (const field of ['firstName', 'lastName'] as const) {
    const value = read(field);
    if (value !== '') {
      if (value !== current[field]) update[field] = value;
    } else if (current[field]) {
      fieldErrors[field] = ['This can’t be left blank once set.'];
    }
  }

  const phone = read('phone').replace(/\s+/g, '');
  if (phone !== (current.phone ?? '')) {
    update.phone = phone;
  }

  return Object.keys(fieldErrors).length > 0
    ? { ok: false, fieldErrors }
    : { ok: true, update };
}
