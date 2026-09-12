'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

export function VariantAddForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-2 border-t pt-4">
      <FormError state={state} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 space-y-1.5">
          <Label htmlFor="variant-sku">SKU code</Label>
          <Input
            id="variant-sku"
            name="skuCode"
            required
            className="font-mono"
            placeholder="MRD-DESK-OAK-140"
          />
        </div>
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor="variant-name">Name</Label>
          <Input id="variant-name" name="name" placeholder="Oak / 140cm" />
        </div>
        <SubmitButton pendingLabel="Adding…">Add variant</SubmitButton>
      </div>
      <FieldError messages={state.fieldErrors?.skuCode} />
      {state.status === 'idle' && state.message ? (
        <p className="text-muted-foreground text-xs" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
