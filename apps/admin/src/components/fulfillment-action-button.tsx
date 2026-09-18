'use client';

import { useActionState } from 'react';

import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * One warehouse action — start picking, ship it, and so on — that takes no
 * input beyond which fulfillment order it targets.
 *
 * Every such action is already bound to its target when this renders, so the
 * button needs nothing from the DOM to submit; a plain `<form>` still backs
 * it, since `useActionState` is what gives it a pending state and surfaces
 * whatever the API rejected it for.
 */
export function FulfillmentActionButton({
  action,
  label,
  pendingLabel,
  variant,
}: {
  action: () => Promise<FormState>;
  label: string;
  pendingLabel?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
}) {
  const [state, formAction] = useActionState(
    async () => action(),
    idleFormState,
  );

  return (
    <form action={formAction} className="space-y-1.5">
      <SubmitButton variant={variant} pendingLabel={pendingLabel ?? 'Working…'}>
        {label}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}
