'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

type SignUpFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  next: string;
};

/**
 * Creates a shopper account.
 *
 * Selling is not granted here — a new account is a customer, and becomes a
 * seller only when an admin approves an application.
 */
export function SignUpForm({ action, next }: SignUpFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <FormError state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="signup-name">Name</Label>
        <Input
          id="signup-name"
          name="name"
          required
          autoComplete="name"
          aria-invalid={fieldErrors.name !== undefined}
        />
        <FieldError messages={fieldErrors.name} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-invalid={fieldErrors.email !== undefined}
        />
        <FieldError messages={fieldErrors.email} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          aria-invalid={fieldErrors.password !== undefined}
        />
        <p className="text-muted-foreground text-xs">At least 8 characters.</p>
        <FieldError messages={fieldErrors.password} />
      </div>

      <SubmitButton pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
