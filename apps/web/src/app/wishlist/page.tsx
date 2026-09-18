import { redirect } from 'next/navigation';

/**
 * The wishlist now lives on the account page's Wishlist tab, not its own
 * route — this exists only so an old bookmark or link still lands somewhere
 * useful.
 */
export default function WishlistPage() {
  redirect('/account?tab=wishlist');
}
