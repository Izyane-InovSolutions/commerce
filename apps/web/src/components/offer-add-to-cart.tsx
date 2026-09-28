'use client';

import { useActionState } from 'react';

import { SubmitButton } from '@/components/submit-button';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * A compact "Add to cart" for one specific offer — one per row of the
 * product page's "Other sellers" list. Posts the same server action the main
 * buy box does, already bound to this row's offer, with a quantity of one.
 */
export function OfferAddToCart({
  addToCart,
  sellerName,
}: {
  addToCart: (state: FormState, formData: FormData) => Promise<FormState>;
  sellerName: string;
}) {
  const [state, formAction] = useActionState(addToCart, idleFormState);

  return (
    <div className="space-y-1 text-right">
      <form action={formAction}>
        <input type="hidden" name="quantity" value={1} />
        <SubmitButton size="sm" variant="outline" pendingLabel="Adding…">
          Add to cart
        </SubmitButton>
      </form>
      {state.status === 'idle' && state.message ? (
        <p className="text-muted-foreground text-xs" role="status">
          Added from {sellerName}.
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className="text-destructive text-xs" role="alert">
          {state.message ?? 'Could not add this to your cart.'}
        </p>
      ) : null}
    </div>
  );
}
