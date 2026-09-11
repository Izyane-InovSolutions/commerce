'use client';

import { useActionState } from 'react';

import type { Seller } from '@commerce/contracts';

import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Suspends or reinstates a seller.
 *
 * Suspending immediately removes that seller's offers from the storefront,
 * which the API enforces — nothing here has to remember to do it.
 */
export function SellerStatusToggle({
  seller,
  action,
}: {
  seller: Seller;
  action: () => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState>(action, idleFormState);
  const suspending = seller.status === 'approved';

  return (
    <form action={formAction} className="space-y-1 text-right">
      <SubmitButton pendingLabel="Working…">
        {suspending ? 'Suspend' : 'Reinstate'}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}
