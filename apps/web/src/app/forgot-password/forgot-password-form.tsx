'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

export function ForgotPasswordForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError state={state} />
      {state.status === 'idle' && state.message ? (
        <p role="status" className="rounded-lg border px-3 py-2 text-sm">
          {state.message}
        </p>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <FieldError messages={state.fieldErrors?.email} />
      </div>
      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
      <p className="text-center text-sm">
        <Link className="text-primary hover:underline" href="/account">
          Return to sign in
        </Link>
      </p>
    </form>
  );
}
