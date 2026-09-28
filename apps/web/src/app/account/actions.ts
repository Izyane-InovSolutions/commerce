'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError } from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { appUrl } from '@/lib/app-url';
import { safeNext } from '@/lib/safe-next';
import type { AuthTokens, SuccessEnvelope } from '@/lib/auth-types';
import { mergeGuestCart } from '@/lib/cart';
import { flagCartMergeFailed } from '@/lib/cart-merge-notice';
import { env } from '@/lib/env';
import { toFormState, type FormState } from '@/lib/form';
import { clearGuestToken } from '@/lib/guest-cookie';
import {
  getProfile,
  profileUpdateFromFormData,
  updateProfile,
} from '@/lib/profile';
import {
  PASSWORD_RESET_SENT_MESSAGE,
  passwordChangeFromFormData,
  passwordResetFromFormData,
} from '@/lib/password-form';
import type { OrderShipment } from '@/lib/commerce-types';
import {
  addressInputFromFormData,
  createAddress,
  deleteAddress,
  getOrderShipments,
  setDefaultAddress,
  updateAddress,
} from '@/lib/orders';
import {
  clearSession,
  readRefreshToken,
  writeSession,
} from '@/lib/session-cookie';

export async function signInAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let tokens: AuthTokens;

  try {
    const response = await apiClient.post<SuccessEnvelope<AuthTokens>>(
      '/auth/login',
      {
        body: {
          email: String(formData.get('email') ?? '').trim(),
          password: String(formData.get('password') ?? ''),
        },
      },
    );
    tokens = response.data;
  } catch (error) {
    return toFormState(error);
  }

  await writeSession(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
  // Written first, so the merge below is made as the signed-in user rather
  // than as the guest whose cart it is folding in.
  await adoptGuestCart();
  redirect(safeNext(formData.get('next'), '/account'));
}

export async function signUpAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let tokens: AuthTokens;

  try {
    const response = await apiClient.post<SuccessEnvelope<AuthTokens>>(
      '/auth/register',
      {
        body: {
          email: String(formData.get('email') ?? '').trim(),
          password: String(formData.get('password') ?? ''),
        },
      },
    );
    tokens = response.data;
  } catch (error) {
    return toFormState(error);
  }

  await writeSession(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
  await adoptGuestCart();
  redirect(safeNext(formData.get('next'), '/account'));
}

/**
 * Folds whatever the visitor had in a guest cart into their own.
 *
 * Once merged, the guest token is dropped: the API identifies a signed-in
 * cart by the bearer token, and a leftover guest cookie would only be a stale
 * pointer to a cart that has already been absorbed. A failed merge keeps the
 * token instead — the guest cart still exists, and the cart page offers to
 * try again — and leaves a flag behind so that page can say what happened.
 */
async function adoptGuestCart(): Promise<void> {
  if ((await mergeGuestCart()) === 'failed') {
    await flagCartMergeFailed();
    return;
  }
  await clearGuestToken();
}

export async function signOutAction(): Promise<void> {
  const refreshToken = await readRefreshToken();

  if (refreshToken) {
    try {
      await apiClient.post('/auth/logout', { body: { refreshToken } });
    } catch {
      // The local cookie is cleared regardless, so a failed round trip cannot
      // strand someone in a half-signed-in state.
    }
  }

  await clearSession();
  redirect('/account');
}

export async function updateProfileAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const parsed = profileUpdateFromFormData(formData, await getProfile());
    if (!parsed.ok) {
      return { status: 'error', fieldErrors: parsed.fieldErrors };
    }
    if (Object.keys(parsed.update).length > 0) {
      await updateProfile(parsed.update);
    }
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/account');
  return { status: 'idle', message: 'Profile saved.' };
}

/**
 * Changes the password from inside a signed-in session.
 *
 * The API signs every *other* session out as part of this and keeps this one,
 * so the cookies here stay as they are.
 */
export async function changePasswordAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = passwordChangeFromFormData(formData);
  if (!parsed.ok) {
    return { status: 'error', fieldErrors: parsed.fieldErrors };
  }

  try {
    await apiClient.patch('/auth/me/password', { body: parsed.body });
  } catch (error) {
    // The same 401 the guard gives a signed-out session, told apart by the
    // API's own wording so an expired session isn't blamed on the password.
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      /current password/i.test(error.message)
    ) {
      return {
        status: 'error',
        fieldErrors: { currentPassword: ['That isn’t your current password.'] },
      };
    }
    return toFormState(error);
  }

  return {
    status: 'idle',
    message: 'Password changed. You’ve been signed out everywhere else.',
  };
}

/**
 * Asks for a reset link. The reply is the same whether or not an account
 * exists for the address — the API answers identically either way, and so
 * must this, or the form becomes a way to find out who has an account.
 */
export async function requestPasswordResetAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim();

  try {
    await apiClient.post('/auth/password-reset/request', { body: { email } });
  } catch (error) {
    // Nothing the API refuses with says whether the account exists — a
    // malformed address, a rate limit, an outage — so those are shown as-is.
    if (error instanceof ApiError && error.status === 429) {
      return {
        status: 'error',
        message: 'Too many attempts. Wait a minute, then try again.',
      };
    }
    return toFormState(error);
  }

  return { status: 'idle', message: PASSWORD_RESET_SENT_MESSAGE };
}

/**
 * Sets a new password from an emailed reset link, then sends the visitor to
 * sign in with it.
 *
 * The API ends every session the account has when a reset goes through, so a
 * session this browser happened to hold is dropped too rather than left
 * looking signed in.
 */
export async function confirmPasswordResetAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = passwordResetFromFormData(formData);
  if (!parsed.ok) {
    return { status: 'error', fieldErrors: parsed.fieldErrors };
  }

  try {
    await apiClient.post('/auth/password-reset/confirm', {
      body: parsed.body,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return {
        status: 'error',
        message:
          'This reset link has expired or has already been used. Request a new one below.',
      };
    }
    return toFormState(error);
  }

  await clearSession();
  redirect('/account?reset=done');
}

export async function addAddressAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await createAddress(addressInputFromFormData(formData));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/account');
  return { status: 'idle', message: 'Address added.' };
}

export async function updateAddressAction(
  addressId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await updateAddress(addressId, addressInputFromFormData(formData));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/account');
  return { status: 'idle', message: 'Address updated.' };
}

export async function deleteAddressAction(
  addressId: string,
): Promise<FormState> {
  try {
    await deleteAddress(addressId);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/account');
  return { status: 'idle', message: 'Address removed.' };
}

export async function setDefaultAddressAction(
  addressId: string,
): Promise<FormState> {
  try {
    await setDefaultAddress(addressId);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/account');
  return { status: 'idle', message: 'Default address updated.' };
}

/**
 * Hands this session off to the seller portal (apps/seller), which keeps its
 * own separate login cookie — mints a one-time code here (authenticated as
 * this user) and sends the browser to redeem it there, landing signed in
 * without a second password prompt. `next` is a path within that app.
 */
async function redirectToSellerApp(next: string): Promise<never> {
  const response = await apiClient.post<SuccessEnvelope<{ code: string }>>(
    '/auth/handoff',
  );
  const url = appUrl(env.sellerAppUrl, '/auth/handoff', {
    code: response.data.code,
    next,
  });
  redirect(url.toString());
}

/** From the account page's "Become a seller" button — lands the customer on
 * the seller portal's existing application form, signed in as themselves. */
export async function becomeSellerAction(): Promise<void> {
  await redirectToSellerApp('/apply');
}

/** From the account page's "Seller dashboard" button, shown once approved. */
export async function goToSellerDashboardAction(): Promise<void> {
  await redirectToSellerApp('/');
}

/**
 * The order detail modal's shipping timeline is the one part of an order
 * card that isn't already on the page — fetched only once someone opens it,
 * rather than for every order in the list up front.
 */
export async function getOrderShipmentsAction(
  orderId: string,
): Promise<{ shipments: OrderShipment[] } | { error: string }> {
  try {
    const shipments = await getOrderShipments(orderId);
    return { shipments };
  } catch (error) {
    const { message } = toFormState(error);
    return { error: message ?? 'Could not load shipping status.' };
  }
}
