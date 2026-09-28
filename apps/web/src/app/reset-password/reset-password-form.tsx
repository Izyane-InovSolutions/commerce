'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

export function ResetPasswordForm({
  action,
  token,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  token: string;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const complete = state.status === 'idle' && Boolean(state.message);

  if (complete) {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-lg border px-3 py-2 text-sm">
          {state.message}
        </p>
        <Link className="text-primary text-sm hover:underline" href="/account">
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormError state={state} />
      <div className="space-y-1.5">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <FieldError messages={state.fieldErrors?.newPassword} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <FieldError messages={state.fieldErrors?.confirmPassword} />
      </div>
      <SubmitButton pendingLabel="Resetting…">Reset password</SubmitButton>
    </form>
  );
}
