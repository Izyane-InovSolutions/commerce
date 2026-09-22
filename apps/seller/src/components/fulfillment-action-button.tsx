'use client';

import { useActionState } from 'react';

import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * One fulfillment action — accept, pack — that takes no input beyond which
 * fulfillment order it targets, already bound when this renders. Mirrors
 * apps/admin's own FulfillmentActionButton so the two portals behave the
 * same way for the same kind of step.
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
