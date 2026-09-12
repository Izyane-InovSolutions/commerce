'use server';

import { revalidatePath } from 'next/cache';

import { addToCart, removeCartItem, updateCartItem } from '@/lib/cart';
import { toFormState, type FormState } from '@/lib/form';

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
