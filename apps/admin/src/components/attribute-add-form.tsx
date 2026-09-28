'use client';

import { useActionState, useState } from 'react';

import { toAttributeCode } from '@/components/attribute-code';
import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Adds a catalog attribute.
 *
 * The code follows the name until someone edits it, the way a brand's slug
 * does: it is what storefront filters key on, so it should be deliberate but
 * not a chore.
 */
export function AttributeAddForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeEdited, setCodeEdited] = useState(false);

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-3">
      <FormError state={state} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor="new-attribute-name">Attribute name</Label>
          <Input
            id="new-attribute-name"
            name="name"
            required
            placeholder="Colour"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!codeEdited) {
                setCode(toAttributeCode(event.target.value));
              }
            }}
            aria-invalid={fieldErrors.name !== undefined}
          />
        </div>

        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor="new-attribute-code">Code</Label>
          <Input
            id="new-attribute-code"
            name="code"
            required
            placeholder="colour"
            className="font-mono"
            value={code}
            onChange={(event) => {
              setCodeEdited(true);
              setCode(event.target.value);
            }}
            aria-invalid={fieldErrors.code !== undefined}
          />
        </div>

        <SubmitButton pendingLabel="Adding…">Add attribute</SubmitButton>
      </div>

      <FieldError messages={fieldErrors.name} />
      <FieldError messages={fieldErrors.code} />
      {state.status === 'idle' && state.message ? (
        <p className="text-muted-foreground text-sm" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
