'use client';

import { useActionState, useRef } from 'react';
import { Trash } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { idleFormState, type FormState } from '@/lib/form';

const UPDATE_DEBOUNCE_MS = 500;

/**
 * Quantity and removal for one cart line.
 *
 * Both are server actions because the cart is the API's, not the browser's —
 * so the line's new state comes back from the same request that changed it.
 * The quantity form submits itself (debounced while typing, immediately on
 * blur) so there is nothing separate for the shopper to click.
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

  const formRef = useRef<HTMLFormElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const submitDebounced = () => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      formRef.current?.requestSubmit();
    }, UPDATE_DEBOUNCE_MS);
  };

  const submitNow = () => {
    clearTimeout(debounceRef.current);
    formRef.current?.requestSubmit();
  };

  const error =
    updateState.status === 'error'
      ? updateState.message
      : removeState.status === 'error'
        ? removeState.message
        : undefined;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <form
          ref={formRef}
          action={updateAction}
          className="flex items-center gap-2"
        >
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
            onChange={submitDebounced}
            onBlur={submitNow}
          />
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
