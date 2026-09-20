'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { apiClient } from '@/lib/api';
import type { AuthTokens, SuccessEnvelope } from '@/lib/auth-types';
import { mergeGuestCart } from '@/lib/cart';
import { toFormState, type FormState } from '@/lib/form';
import { clearGuestToken } from '@/lib/guest-cookie';
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
  redirect(String(formData.get('next') || '/account'));
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
  redirect(String(formData.get('next') || '/account'));
}

/**
 * Folds whatever the visitor had in a guest cart into their own.
 *
 * The guest token is dropped either way: once an account is signed in, the
 * API identifies their cart by the bearer token, and a leftover guest cookie
 * would only be a stale pointer to a cart that has already been absorbed.
 */
async function adoptGuestCart(): Promise<void> {
  await mergeGuestCart();
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
