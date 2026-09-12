'use client';

import { useActionState } from 'react';
import { Trash } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { idleFormState, type FormState } from '@/lib/form';

/** Add one saved item to the cart, or stop saving it. */
export function WishlistItemActions({
  available,
  addToCart,
  remove,
}: {
  available: boolean;
  addToCart: () => Promise<FormState>;
  remove: () => Promise<FormState>;
}) {
  const [addState, addAction] = useActionState(
    async () => addToCart(),
    idleFormState,
  );
  const [removeState, removeAction] = useActionState(
    async () => remove(),
    idleFormState,
  );

  const error =
    addState.status === 'error'
      ? addState.message
      : removeState.status === 'error'
        ? removeState.message
        : undefined;

  return (
    <div className="space-y-1 text-right">
      <div className="flex items-center justify-end gap-2">
        <form action={addAction}>
          <Button type="submit" size="sm" disabled={!available}>
            {available ? 'Add to cart' : 'Unavailable'}
          </Button>
        </form>
        <form action={removeAction}>
          <Button type="submit" variant="ghost" size="sm">
            <Trash data-icon="inline-start" />
            Remove
          </Button>
        </form>
      </div>

      {addState.status === 'idle' && addState.message ? (
        <p className="text-muted-foreground text-xs" role="status">
          {addState.message}
        </p>
      ) : null}
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
