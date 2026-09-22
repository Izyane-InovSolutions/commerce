'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SelectField } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

/** Every status a seller may report on their own shipment — internal states
 * like BOOKED/DISPATCHED are the API's own to set, never postable here. */
const STATUS_OPTIONS = [
  { value: 'IN_TRANSIT', label: 'In transit' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'DELIVERY_FAILED', label: 'Delivery attempt failed' },
  { value: 'EXCEPTION', label: 'Delivery exception' },
  { value: 'RETURN_TO_SENDER', label: 'Returning to sender' },
  { value: 'RETURNED', label: 'Returned to sender' },
];

export function TrackShipmentForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-2 rounded-lg border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="normalizedStatus" className="text-xs">
            Status
          </Label>
          <SelectField
            id="normalizedStatus"
            name="normalizedStatus"
            placeholder="Choose a status"
            options={STATUS_OPTIONS}
            aria-invalid={state.fieldErrors?.normalizedStatus !== undefined}
            className="w-full"
          />
          <FieldError messages={state.fieldErrors?.normalizedStatus} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="location" className="text-xs">
            Location
          </Label>
          <Input id="location" name="location" placeholder="Optional" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="description" className="text-xs">
          Note
        </Label>
        <Input id="description" name="description" placeholder="Optional" />
      </div>
      <SubmitButton variant="outline" pendingLabel="Saving…">
        Add update
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}
