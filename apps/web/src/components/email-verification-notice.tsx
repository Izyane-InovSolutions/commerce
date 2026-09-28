'use client';

import { useActionState } from 'react';

import { SubmitButton } from '@/components/submit-button';
import type { FormState } from '@/lib/form';
import { idleFormState } from '@/lib/form';

export function EmailVerificationNotice({
  email,
  resend,
}: {
  email: string;
  resend: (state: FormState) => Promise<FormState>;
}) {
  const [state, action] = useActionState(resend, idleFormState);

  return (
    <div className="space-y-3 rounded-xl border border-amber-400/50 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
      <div>
        <p className="font-medium">Verify your email address</p>
        <p>
          We sent a verification link to {email}. Verification is required for
          seller features.
        </p>
      </div>
      {state.message ? <p role="status">{state.message}</p> : null}
      <form action={action}>
        <SubmitButton
          pendingLabel="Sending…"
          variant="outline"
          size="sm"
          className="w-auto"
        >
          Resend verification email
        </SubmitButton>
      </form>
    </div>
  );
}
