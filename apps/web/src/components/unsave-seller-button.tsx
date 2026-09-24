'use client';

import { useActionState } from 'react';
import { Trash } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { idleFormState, type FormState } from '@/lib/form';

/** Stops saving one seller, from the account page's Saved sellers tab. */
export function UnsaveSellerButton({
  remove,
}: {
  remove: () => Promise<FormState>;
}) {
  const [state, action] = useActionState(async () => remove(), idleFormState);

  return (
    <div className="space-y-1 text-right">
      <form action={action}>
        <Button type="submit" variant="ghost" size="sm">
          <Trash data-icon="inline-start" />
          Remove
        </Button>
      </form>
      {state.status === 'error' ? (
        <p className="text-destructive text-xs" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
