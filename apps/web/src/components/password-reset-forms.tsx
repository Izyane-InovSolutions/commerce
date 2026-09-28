'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-form';

type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * Asks for a reset link. Once accepted, the form gives way to the same
 * message whatever the address was, so it can't be used to learn who has an
 * account.
 */
export function ForgotPasswordForm({ action }: { action: FormAction }) {
  const [state, formAction] = useActionState(action, idleFormState);

  if (state.status === 'idle' && state.message) {
    return (
      <div role="status" className="space-y-3 text-sm">
        <p className="text-pretty">{state.message}</p>
        <p className="text-muted-foreground text-pretty">
          Nothing arrived after a few minutes? Check your spam folder, then
          reload this page to send another.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormError state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={state.fieldErrors?.email !== undefined}
        />
        <FieldError messages={state.fieldErrors?.email} />
      </div>

      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

/** Sets a new password from an emailed link; the action signs the visitor
 * out and sends them to sign in once it goes through. */
export function ResetPasswordForm({
  action,
  token,
}: {
  action: FormAction;
  token: string;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormError state={state} />
      <FieldError messages={fieldErrors.token} />

      <div className="space-y-1.5">
        <Label htmlFor="reset-new-password">New password</Label>
        <Input
          id="reset-new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          aria-invalid={fieldErrors.newPassword !== undefined}
        />
        <FieldError messages={fieldErrors.newPassword} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reset-confirm-password">Confirm new password</Label>
        <Input
          id="reset-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={fieldErrors.confirmPassword !== undefined}
        />
        <FieldError messages={fieldErrors.confirmPassword} />
      </div>

      <p className="text-muted-foreground text-xs">
        At least {MIN_PASSWORD_LENGTH} characters. Setting it signs you out on
        every device.
      </p>

      <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>
    </form>
  );
}
