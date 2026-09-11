'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

type SignInFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  next: string;
};

export function SignInForm({ action, next }: SignInFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <FormError state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={fieldErrors.email !== undefined}
        />
        <FieldError messages={fieldErrors.email} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={fieldErrors.password !== undefined}
        />
        <FieldError messages={fieldErrors.password} />
      </div>

      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
