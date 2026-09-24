'use client';

import { useActionState } from 'react';
import { Lock, Mail } from 'lucide-react';

import { AuthInput } from '@/components/auth-input';
import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
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
        <Label htmlFor="email" className="sr-only">
          Email
        </Label>
        <AuthInput
          icon={Mail}
          id="email"
          name="email"
          type="email"
          placeholder="Email"
          autoComplete="email"
          required
          aria-invalid={fieldErrors.email !== undefined}
        />
        <FieldError messages={fieldErrors.email} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="sr-only">
          Password
        </Label>
        <AuthInput
          icon={Lock}
          id="password"
          name="password"
          placeholder="Password"
          toggleable
          autoComplete="current-password"
          required
          aria-invalid={fieldErrors.password !== undefined}
        />
        <FieldError messages={fieldErrors.password} />
      </div>

      <SubmitButton
        pendingLabel="Signing in…"
        variant="outline"
        className="w-full rounded-full border-white/60 bg-transparent text-white hover:bg-blue-800 hover:text-white"
      >
        Login
      </SubmitButton>
    </form>
  );
}
