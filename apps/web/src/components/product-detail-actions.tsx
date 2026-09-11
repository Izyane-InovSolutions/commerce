'use client';

import { useActionState } from 'react';
import Link from 'next/link';

import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
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
  available,
  addToCart,
}: {
  name: string;
  /** False when nothing on this product is currently sellable. */
  available: boolean;
  addToCart: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(addToCart, idleFormState);

  if (!available) {
    return (
      <Button disabled className="w-full sm:w-auto">
        Currently unavailable
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <form action={formAction} className="flex items-center gap-3">
          <input type="hidden" name="quantity" value={1} />
          <SubmitButton size="default" pendingLabel="Adding…">
            Add to cart
          </SubmitButton>
        </form>
        <Button variant="outline" asChild>
          <Link href="/cart">Go to cart</Link>
        </Button>
      </div>

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
    </div>
  );
}
