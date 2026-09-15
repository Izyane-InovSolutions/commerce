'use client';

import { useActionState, useId } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Address } from '@/lib/commerce-types';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Where an order is delivered — used both to add a first address during
 * checkout and, with `defaultValues`, to edit one already saved.
 */
export function AddressForm({
  action,
  defaultValues,
  submitLabel = 'Save address',
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaultValues?: Partial<Address>;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  // The account page can render several of these at once (an edit form per
  // address, plus the add-new one) — hardcoded ids would collide and break
  // every label's `htmlFor` but the first form's.
  const formId = useId();
  const fieldId = (field: string): string => `${formId}-${field}`;

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={fieldId('recipient-name')}>Recipient name</Label>
          <Input
            id={fieldId('recipient-name')}
            name="recipientName"
            defaultValue={defaultValues?.recipientName}
            required
          />
          <FieldError messages={state.fieldErrors?.recipientName} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={fieldId('address-line1')}>Address</Label>
          <Input
            id={fieldId('address-line1')}
            name="line1"
            defaultValue={defaultValues?.line1}
            required
          />
          <FieldError messages={state.fieldErrors?.line1} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={fieldId('address-line2')}>
            Apartment, suite (optional)
          </Label>
          <Input
            id={fieldId('address-line2')}
            name="line2"
            defaultValue={defaultValues?.line2 ?? undefined}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={fieldId('address-city')}>City</Label>
          <Input
            id={fieldId('address-city')}
            name="city"
            defaultValue={defaultValues?.city}
            required
          />
          <FieldError messages={state.fieldErrors?.city} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={fieldId('address-region')}>
            Province (optional)
          </Label>
          <Input
            id={fieldId('address-region')}
            name="region"
            defaultValue={defaultValues?.region ?? undefined}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={fieldId('address-postal')}>Postal code</Label>
          <Input
            id={fieldId('address-postal')}
            name="postalCode"
            defaultValue={defaultValues?.postalCode}
            required
          />
          <FieldError messages={state.fieldErrors?.postalCode} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={fieldId('address-country')}>Country</Label>
          <Input
            id={fieldId('address-country')}
            name="country"
            defaultValue={defaultValues?.country ?? 'ZM'}
            maxLength={2}
            pattern="[A-Za-z]{2}"
            title="Two-letter country code"
            required
          />
          <FieldError messages={state.fieldErrors?.country} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={fieldId('address-phone')}>Phone (optional)</Label>
          <Input
            id={fieldId('address-phone')}
            name="phone"
            type="tel"
            defaultValue={defaultValues?.phone ?? undefined}
          />
        </div>
      </div>

      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      <FormError state={state} />
    </form>
  );
}
