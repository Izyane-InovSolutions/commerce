'use client';

import { useActionState, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * Disable or re-enable an account, asking once before it fires.
 *
 * As with DeleteControl, the first click only opens the confirmation. The
 * API's refusal (yourself, the last admin) is shown in place — outside the
 * confirmation, so closing it doesn't hide why nothing happened.
 */
export function AccountStatusControl({
  isActive,
  email,
  action,
}: {
  isActive: boolean;
  email: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (previous: FormState, formData: FormData) => {
      const next = await action(previous, formData);
      if (next.status === 'idle') setConfirming(false);
      return next;
    },
    idleFormState,
  );

  const verb = isActive ? 'Disable' : 'Enable';

  return (
    <div className="space-y-3">
      {confirming ? (
        <form
          action={formAction}
          className="space-y-3 rounded-lg border p-3"
          aria-label={`${verb} account`}
        >
          <p className="text-sm text-pretty">
            {isActive
              ? `Disable ${email}? They are signed out everywhere at once and cannot sign in until an administrator enables the account again. A seller's listings leave the storefront while it is disabled.`
              : `Enable ${email}? They will be able to sign in again with their existing password.`}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="status-reason">Reason (optional)</Label>
            <Textarea
              id="status-reason"
              name="reason"
              rows={2}
              maxLength={500}
              placeholder="Kept with the change in the audit log."
              aria-invalid={state.fieldErrors?.reason ? true : undefined}
            />
            <FieldError messages={state.fieldErrors?.reason} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant={isActive ? 'destructive' : 'default'}
              size="sm"
              disabled={pending}
            >
              {pending ? `${verb.slice(0, -1)}ing…` : `${verb} account`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={isActive ? 'destructive' : 'default'}
            size="sm"
            onClick={() => setConfirming(true)}
          >
            {verb} account
          </Button>
          {state.status === 'idle' && state.message ? (
            <span className="text-muted-foreground text-xs" role="status">
              {state.message}
            </span>
          ) : null}
        </div>
      )}
      <FormError state={state} />
    </div>
  );
}
