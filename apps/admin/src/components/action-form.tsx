'use client';

import { useActionState, type ReactNode } from 'react';
import { idleFormState, type FormState } from '@/lib/form';
import { SubmitButton } from './submit-button';

/** Shared submission feedback for the portal's operational forms. */
export function ActionForm({ action, label, children }: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  label: string;
  children?: ReactNode;
}) {
  const [state, submit] = useActionState(action, idleFormState);
  return <form action={submit} className="space-y-3 rounded-lg border p-4">
    {children}
    {state.message && <p role={state.status === 'error' ? 'alert' : 'status'} className={state.status === 'error' ? 'text-destructive text-sm' : 'text-sm'}>{state.message}</p>}
    {state.fieldErrors && <ul className="text-destructive text-sm" role="alert">{Object.entries(state.fieldErrors).flatMap(([field, errors]) => errors.map(error => <li key={`${field}:${error}`}>{field}: {error}</li>))}</ul>}
    <SubmitButton pendingLabel="Saving…">{label}</SubmitButton>
  </form>;
}
