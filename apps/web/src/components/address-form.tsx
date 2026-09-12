'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

/** Where an order is delivered. Required before anything can be checked out. */
export function AddressForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="recipient-name">Recipient name</Label>
          <Input id="recipient-name" name="recipientName" required />
          <FieldError messages={state.fieldErrors?.recipientName} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address-line1">Address</Label>
          <Input id="address-line1" name="line1" required />
          <FieldError messages={state.fieldErrors?.line1} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address-line2">Apartment, suite (optional)</Label>
          <Input id="address-line2" name="line2" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address-city">City</Label>
          <Input id="address-city" name="city" required />
          <FieldError messages={state.fieldErrors?.city} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address-region">Province (optional)</Label>
          <Input id="address-region" name="region" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address-postal">Postal code</Label>
          <Input id="address-postal" name="postalCode" required />
          <FieldError messages={state.fieldErrors?.postalCode} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address-country">Country</Label>
          <Input
            id="address-country"
            name="country"
            defaultValue="ZM"
            maxLength={2}
            pattern="[A-Za-z]{2}"
            title="Two-letter country code"
            required
          />
          <FieldError messages={state.fieldErrors?.country} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address-phone">Phone (optional)</Label>
          <Input id="address-phone" name="phone" type="tel" />
        </div>
      </div>

      <SubmitButton pendingLabel="Saving…">Save address</SubmitButton>
      <FormError state={state} />
    </form>
  );
}
