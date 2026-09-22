'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

/** How the storefront appears to shoppers, and the slug it lives at. */
export function StorefrontForm({
  version,
  storefrontSlug,
  displayName,
  description,
  action,
}: {
  version: number;
  storefrontSlug: string | null;
  displayName: string | null;
  description: string | null;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="version" value={version} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="storefront-name">Display name</Label>
          <Input
            id="storefront-name"
            name="displayName"
            defaultValue={displayName ?? ''}
            minLength={2}
            maxLength={120}
            required
            aria-invalid={state.fieldErrors?.displayName ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.displayName} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="storefront-slug">Storefront address</Label>
          <Input
            id="storefront-slug"
            name="storefrontSlug"
            defaultValue={storefrontSlug ?? ''}
            minLength={3}
            maxLength={100}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Lowercase letters, numbers, and single hyphens"
            required
            aria-invalid={state.fieldErrors?.storefrontSlug ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.storefrontSlug} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="storefront-description">Description</Label>
        <Textarea
          id="storefront-description"
          name="description"
          rows={4}
          maxLength={2000}
          defaultValue={description ?? ''}
          placeholder="What you sell, and what shoppers should know about buying from you."
        />
        <FieldError messages={state.fieldErrors?.description} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Saving…">Save storefront</SubmitButton>
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
