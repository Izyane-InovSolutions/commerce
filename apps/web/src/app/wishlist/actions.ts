'use server';

import { revalidatePath } from 'next/cache';

import { addToCart } from '@/lib/cart';
import { toFormState, type FormState } from '@/lib/form';
import { removeFromWishlist } from '@/lib/wishlist';

export async function removeFromWishlistAction(
  offerId: string,
): Promise<FormState> {
  try {
    await removeFromWishlist(offerId);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/wishlist');
  return { status: 'idle', message: 'Removed.' };
}

/**
 * Moves a saved item into the cart.
 *
 * It is left on the wishlist afterwards: the API has no "move" and removing
 * it here would silently lose the save if the checkout is abandoned.
 */
export async function addWishlistItemToCartAction(
  offerId: string,
): Promise<FormState> {
  try {
    await addToCart(offerId, 1);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/cart');
  return { status: 'idle', message: 'Added to your cart.' };
}
