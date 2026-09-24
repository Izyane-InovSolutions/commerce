'use client';

import { useActionState } from 'react';
import { Lock, Mail } from 'lucide-react';

import { AuthInput } from '@/components/auth-input';
import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

type SignUpFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  next: string;
};

/**
 * Creates a shopper account.
 *
 * Every new account is a customer. Seller and admin access are granted
 * separately, never chosen at sign-up.
 */
export function SignUpForm({ action, next }: SignUpFormProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <FormError state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="signup-email" className="sr-only">
          Email
        </Label>
        <AuthInput
          icon={Mail}
          id="signup-email"
          name="email"
          type="email"
          placeholder="Email"
          required
          autoComplete="email"
          aria-invalid={fieldErrors.email !== undefined}
        />
        <FieldError messages={fieldErrors.email} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signup-password" className="sr-only">
          Password
        </Label>
        <AuthInput
          icon={Lock}
          id="signup-password"
          name="password"
          placeholder="Password"
          toggleable
          required
          autoComplete="new-password"
          aria-invalid={fieldErrors.password !== undefined}
        />
        <p className="text-muted-foreground text-xs">At least 8 characters.</p>
        <FieldError messages={fieldErrors.password} />
      </div>

      <SubmitButton
        pendingLabel="Creating account…"
        className="rounded-full bg-blue-700 text-white hover:bg-blue-700/90"
      >
        Sign up
      </SubmitButton>
    </form>
  );
}
