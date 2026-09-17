'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';

import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Adds this product to the cart.
 *
 * The cart belongs to the API, so this posts to a server action rather than
 * changing anything in the browser — which is also what lets a guest keep a
 * cart across visits, since the action is what sets the cookie identifying it.
 */
export function ProductDetailActions({
  name,
  slug,
  available,
  inStock,
  addToCart,
  addToWishlist,
}: {
  name: string;
  slug: string;
  /** False when nothing on this product is currently sellable. */
  available: boolean;
  /** False once the offer that would be bought has run out of stock. */
  inStock: boolean;
  addToCart: (state: FormState, formData: FormData) => Promise<FormState>;
  addToWishlist: () => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(addToCart, idleFormState);
  const [wishlistState, wishlistAction] = useActionState(
    async () => addToWishlist(),
    idleFormState,
  );
  const [quantity, setQuantity] = useState(1);

  if (!available) {
    return (
      <Button disabled className="w-full sm:w-auto">
        Currently unavailable
      </Button>
    );
  }

  // A shopper can still wishlist something to buy later even while it's out
  // of stock — only buying it outright is blocked.
  const wishlistForm = (
    <form action={wishlistAction}>
      <Button type="submit" variant="outline">
        <Heart data-icon="inline-start" />
        Add to wishlist
      </Button>
    </form>
  );

  const wishlistNotices = (
    <>
      {wishlistState.status === 'idle' && wishlistState.message ? (
        <p className="text-muted-foreground text-sm" role="status">
          {name} saved to your wishlist.
        </p>
      ) : null}
      {wishlistState.status === 'error' ? (
        <p className="text-destructive text-sm" role="alert">
          {wishlistState.message ?? 'Could not save this to your wishlist.'}
        </p>
      ) : null}
    </>
  );

  if (!inStock) {
    return (
      <div className="space-y-2">
        <p className="text-destructive text-sm font-medium" role="status">
          Out of stock
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled>Out of stock</Button>
          {wishlistForm}
        </div>
        {wishlistNotices}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label htmlFor="product-quantity" className="text-sm font-medium">
          Quantity
        </label>
        <Input
          id="product-quantity"
          type="number"
          min={1}
          value={quantity}
          onChange={(event) => {
            const next = Number(event.target.value);
            setQuantity(Number.isInteger(next) && next > 0 ? next : 1);
          }}
          className="w-16"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action={formAction} className="flex items-center gap-3">
          <input type="hidden" name="quantity" value={quantity} />
          <SubmitButton size="default" pendingLabel="Adding…">
            Add to cart
          </SubmitButton>
        </form>
        <Button asChild>
          <Link href={`/buy-now/${slug}?quantity=${quantity}`}>
            Buy it now
          </Link>
        </Button>
      </div>

      {wishlistForm}

      {state.status === 'idle' && state.message ? (
        <p className="text-muted-foreground text-sm" role="status">
          {name} added to your cart.
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className="text-destructive text-sm" role="alert">
          {state.message ?? 'Could not add this to your cart.'}
        </p>
      ) : null}
      {wishlistNotices}
    </div>
  );
}
