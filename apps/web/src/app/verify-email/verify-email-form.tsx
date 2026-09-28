'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { idleFormState, type FormState } from '@/lib/form';

export function VerifyEmailForm({
  action,
  token,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  token: string;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  if (state.status === 'idle' && state.message) {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-lg border px-3 py-2 text-sm">
          {state.message}
        </p>
        <Link className="text-primary text-sm hover:underline" href="/account">
          Continue to your account
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormError state={state} />
      <SubmitButton pendingLabel="Verifying…">
        Verify email address
      </SubmitButton>
    </form>
  );
}
