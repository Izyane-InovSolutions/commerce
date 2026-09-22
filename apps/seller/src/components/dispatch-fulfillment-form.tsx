'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Dispatches whatever is packed and not yet dispatched — there's no
 * platform carrier integration for a seller's own shipment, so this just
 * records who's carrying it, unlike admin's book-then-dispatch flow.
 */
export function DispatchFulfillmentForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-2 rounded-lg border p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="carrierCode" className="text-xs">
            Carrier
          </Label>
          <Input
            id="carrierCode"
            name="carrierCode"
            placeholder="e.g. DHL"
            aria-invalid={state.fieldErrors?.carrierCode !== undefined}
          />
          <FieldError messages={state.fieldErrors?.carrierCode} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="trackingReference" className="text-xs">
            Tracking reference
          </Label>
          <Input id="trackingReference" name="trackingReference" placeholder="Optional" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="estimatedDeliveryAt" className="text-xs">
            Estimated delivery
          </Label>
          <Input id="estimatedDeliveryAt" name="estimatedDeliveryAt" type="date" />
        </div>
      </div>
      <SubmitButton pendingLabel="Dispatching…">Dispatch</SubmitButton>
      <FormError state={state} />
    </form>
  );
}
