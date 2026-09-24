'use client';

import { useActionState } from 'react';
import { Heart } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { idleFormState, type FormState } from '@/lib/form';

/** Saves this seller to the signed-in shopper's account, for the account
 * page's Saved sellers tab. Mirrors ProductDetailActions' wishlist button. */
export function SaveSellerButton({
  displayName,
  save,
}: {
  displayName: string;
  save: () => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(
    async () => save(),
    idleFormState,
  );

  return (
    <div className="space-y-1">
      <form action={formAction}>
        <Button type="submit" variant="outline">
          <Heart data-icon="inline-start" />
          Save seller
        </Button>
      </form>

      {state.status === 'idle' && state.message ? (
        <p className="text-muted-foreground text-sm" role="status">
          {displayName} saved to your account.
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className="text-destructive text-sm" role="alert">
          {state.message ?? 'Could not save this seller.'}
        </p>
      ) : null}
    </div>
  );
}
