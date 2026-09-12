'use client';

import { useActionState, useId } from 'react';

import {
  backendOfferConditions,
  backendOfferSources,
} from '@commerce/contracts';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SelectField } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

const CONDITION_OPTIONS = backendOfferConditions.map((value) => ({
  value,
  label: value.charAt(0) + value.slice(1).toLowerCase(),
}));

const SOURCE_OPTIONS = backendOfferSources.map((value) => ({
  value,
  label: value === 'PLATFORM' ? 'Platform' : 'Me',
}));

export type OfferDefaults = {
  sellerSku?: string | null;
  listingTitle?: string | null;
  condition?: string;
  stockSource?: string;
  fulfillmentMode?: string;
};

/**
 * The listing itself: how a seller describes and qualifies what they sell.
 *
 * Used for both creating and editing, because the API takes the same fields
 * either way — a create adds the variant being listed against and an opening
 * price, an edit adds the version it is working from.
 */
export function OfferForm({
  action,
  defaults,
  version,
  variantId,
  currency = 'ZMW',
  submitLabel,
  withPrice = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: OfferDefaults;
  /** Required when editing: the API refuses a write against a stale version. */
  version?: number;
  /** Required when creating: which variant this lists against. */
  variantId?: string;
  currency?: string;
  submitLabel: string;
  withPrice?: boolean;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldId = useId();

  return (
    <form action={formAction} className="space-y-4">
      {version === undefined ? null : (
        <input type="hidden" name="version" value={version} />
      )}
      {variantId === undefined ? null : (
        <input type="hidden" name="variantId" value={variantId} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-title`}>Listing title</Label>
          <Input
            id={`${fieldId}-title`}
            name="listingTitle"
            required
            minLength={2}
            maxLength={200}
            defaultValue={defaults?.listingTitle ?? ''}
            aria-invalid={state.fieldErrors?.listingTitle ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.listingTitle} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-sku`}>Your SKU</Label>
          <Input
            id={`${fieldId}-sku`}
            name="sellerSku"
            required
            maxLength={100}
            defaultValue={defaults?.sellerSku ?? ''}
            aria-invalid={state.fieldErrors?.sellerSku ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.sellerSku} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-condition`}>Condition</Label>
          <SelectField
            id={`${fieldId}-condition`}
            name="condition"
            className="w-full"
            defaultValue={defaults?.condition ?? 'NEW'}
            options={CONDITION_OPTIONS}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-stock`}>Stock held by</Label>
          <SelectField
            id={`${fieldId}-stock`}
            name="stockSource"
            className="w-full"
            defaultValue={defaults?.stockSource ?? 'PLATFORM'}
            options={SOURCE_OPTIONS}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-fulfillment`}>Shipped by</Label>
          <SelectField
            id={`${fieldId}-fulfillment`}
            name="fulfillmentMode"
            className="w-full"
            defaultValue={defaults?.fulfillmentMode ?? 'PLATFORM'}
            options={SOURCE_OPTIONS}
          />
        </div>
      </div>

      {withPrice ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-amount`}>Price</Label>
            <Input
              id={`${fieldId}-amount`}
              name="amount"
              inputMode="decimal"
              placeholder="0.00"
              required
              aria-invalid={state.fieldErrors?.amount ? true : undefined}
            />
            <FieldError messages={state.fieldErrors?.amount} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-currency`}>Currency</Label>
            <Input
              id={`${fieldId}-currency`}
              name="currency"
              defaultValue={currency}
              maxLength={3}
              pattern="[A-Za-z]{3}"
              required
              aria-invalid={state.fieldErrors?.currency ? true : undefined}
            />
            <FieldError messages={state.fieldErrors?.currency} />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        {state.status === 'idle' && state.message ? (
          <span className="text-muted-foreground text-xs" role="status">
            {state.message}
          </span>
        ) : null}
      </div>

      <FieldError messages={state.fieldErrors?.version} />
      <FormError state={state} />
    </form>
  );
}
