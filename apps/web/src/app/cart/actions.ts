'use server';

import { revalidatePath } from 'next/cache';

import {
  addToCart,
  mergeGuestCart,
  removeCartItem,
  updateCartItem,
} from '@/lib/cart';
import { clearCartMergeFailed } from '@/lib/cart-merge-notice';
import { toFormState, type FormState } from '@/lib/form';
import { clearGuestToken } from '@/lib/guest-cookie';

function revalidateCart(): void {
  revalidatePath('/cart');
  revalidatePath('/checkout');
}

/**
 * Adds an offer to the cart.
 *
 * Runs as a server action rather than in the browser because the cart's
 * identity is a cookie the API mints, and a cookie can only be written from
 * the server.
 */
export async function addToCartAction(
  offerId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const quantity = Number(formData.get('quantity') ?? 1);

  try {
    await addToCart(offerId, Number.isInteger(quantity) ? quantity : 1);
  } catch (error) {
    return toFormState(error);
  }

  revalidateCart();
  return { status: 'idle', message: 'Added to your cart.' };
}

export async function updateCartItemAction(
  itemId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const quantity = Number(formData.get('quantity'));

  if (!Number.isInteger(quantity) || quantity < 1) {
    return {
      status: 'error',
      message: 'Enter a quantity of at least one.',
    };
  }

  try {
    await updateCartItem(itemId, quantity);
  } catch (error) {
    return toFormState(error);
  }

  revalidateCart();
  return { status: 'idle', message: 'Updated.' };
}

export async function removeCartItemAction(itemId: string): Promise<FormState> {
  try {
    await removeCartItem(itemId);
  } catch (error) {
    return toFormState(error);
  }

  revalidateCart();
  return { status: 'idle', message: 'Removed.' };
}

/**
 * Tries again to fold the guest cart into the signed-in account, after the
 * attempt made at sign-in failed. On success the guest token goes, same as
 * it would have then; on failure both it and the notice stay, so the shopper
 * can try once more or dismiss it.
 */
export async function retryCartMergeAction(): Promise<FormState> {
  const outcome = await mergeGuestCart();

  if (outcome === 'failed') {
    return {
      status: 'error',
      message: 'Still could not bring those items over. Try again later.',
    };
  }

  await clearGuestToken();
  await clearCartMergeFailed();
  revalidateCart();
  return { status: 'idle', message: 'Items added to your cart.' };
}

/** Gives up on the guest cart: the notice and the token behind it both go. */
export async function dismissCartMergeNoticeAction(): Promise<void> {
  await clearGuestToken();
  await clearCartMergeFailed();
  revalidateCart();
  revalidatePath('/account');
}
