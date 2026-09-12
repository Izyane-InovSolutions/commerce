'use client';

import { useActionState } from 'react';
import { Trash } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/submit-button';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Quantity and removal for one cart line.
 *
 * Both are server actions because the cart is the API's, not the browser's —
 * so the line's new state comes back from the same request that changed it.
 */
export function CartLineControls({
  quantity,
  update,
  remove,
}: {
  quantity: number;
  update: (state: FormState, formData: FormData) => Promise<FormState>;
  remove: () => Promise<FormState>;
}) {
  const [updateState, updateAction] = useActionState(update, idleFormState);
  const [removeState, removeAction] = useActionState(
    async () => remove(),
    idleFormState,
  );

  const error =
    updateState.status === 'error'
      ? updateState.message
      : removeState.status === 'error'
        ? removeState.message
        : undefined;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <form action={updateAction} className="flex items-center gap-2">
          <label htmlFor={`quantity-${quantity}`} className="sr-only">
            Quantity
          </label>
          <Input
            name="quantity"
            type="number"
            min={1}
            defaultValue={quantity}
            className="w-16"
            aria-label="Quantity"
          />
          <SubmitButton variant="outline" size="sm" pendingLabel="Saving…">
            Update
          </SubmitButton>
        </form>

        <form action={removeAction}>
          <Button variant="ghost" size="sm" type="submit">
            <Trash data-icon="inline-start" />
            Remove
          </Button>
        </form>
      </div>

      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
