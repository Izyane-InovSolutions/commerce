'use client';

import { useActionState, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ApplyForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <FormError state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="displayName">Store name</Label>
        <Input
          id="displayName"
          name="displayName"
          required
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
            if (!slugEdited) {
              setSlug(toSlug(event.target.value));
            }
          }}
          aria-invalid={fieldErrors.displayName !== undefined}
        />
        <p className="text-muted-foreground text-xs">
          What shoppers see next to your offers.
        </p>
        <FieldError messages={fieldErrors.displayName} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">Store address</Label>
        <Input
          id="slug"
          name="slug"
          required
          className="font-mono"
          value={slug}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value);
          }}
          aria-invalid={fieldErrors.slug !== undefined}
        />
        <FieldError messages={fieldErrors.slug} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contactEmail">Contact email</Label>
        <Input
          id="contactEmail"
          name="contactEmail"
          type="email"
          required
          aria-invalid={fieldErrors.contactEmail !== undefined}
        />
        <p className="text-muted-foreground text-xs">
          Used by the platform for account and payout matters.
        </p>
        <FieldError messages={fieldErrors.contactEmail} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">What do you sell?</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          required
          placeholder="Tell the reviewer what you sell and where it comes from."
          aria-invalid={fieldErrors.description !== undefined}
        />
        <FieldError messages={fieldErrors.description} />
      </div>

      <SubmitButton pendingLabel="Submitting…">Apply to sell</SubmitButton>
    </form>
  );
}
