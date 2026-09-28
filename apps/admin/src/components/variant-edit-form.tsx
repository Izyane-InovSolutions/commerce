'use client';

import { useActionState, useState } from 'react';

import {
  AttributeValuePicker,
  type AttributeChoice,
} from '@/components/attribute-value-picker';
import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Edits one variant's SKU, name, and attribute values in place.
 *
 * Closed by default so a product with many variants stays readable; the
 * current values are listed while it is closed.
 */
export function VariantEditForm({
  variant,
  attributes,
  action,
}: {
  variant: {
    id: string;
    skuCode: string;
    name: string | null;
    /** Value ids the variant carries now. */
    attributeValueIds: string[];
  };
  /** Null when the attribute list could not be read: values are then left as they are. */
  attributes: AttributeChoice[] | null;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, idleFormState);
  const idPrefix = `variant-${variant.id}`;

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          Edit variant
        </Button>
        {state.status === 'idle' && state.message ? (
          <span className="text-muted-foreground text-xs" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-lg border p-3">
      <FormError state={state} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 space-y-1.5">
          <Label htmlFor={`${idPrefix}-sku`}>SKU code</Label>
          <Input
            id={`${idPrefix}-sku`}
            name="skuCode"
            required
            defaultValue={variant.skuCode}
            className="font-mono"
            aria-invalid={state.fieldErrors?.skuCode ? true : undefined}
          />
        </div>
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor={`${idPrefix}-name`}>Name</Label>
          <Input
            id={`${idPrefix}-name`}
            name="name"
            defaultValue={variant.name ?? ''}
            placeholder="Blank shows the SKU"
          />
        </div>
        {attributes ? (
          <AttributeValuePicker
            attributes={attributes}
            selected={variant.attributeValueIds}
            idPrefix={idPrefix}
          />
        ) : null}
      </div>
      <FieldError messages={state.fieldErrors?.skuCode} />
      <FieldError messages={state.fieldErrors?.attributeValueIds} />
      {attributes === null ? (
        <p className="text-muted-foreground text-xs">
          Attributes could not be loaded, so this save leaves the variant&apos;s
          values as they are.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Saving…">Save variant</SubmitButton>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Close
        </Button>
        {state.status === 'idle' && state.message ? (
          <span className="text-muted-foreground text-xs" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
