'use client';

import { useActionState } from 'react';

import type { BackendRole } from '@commerce/contracts';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SelectField } from '@/components/select-field';
import { SubmitButton } from '@/components/submit-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

import { roleLabel } from '../users';

/**
 * Picks a new role. The current one travels as `expectedRole`, which is what
 * lets the API refuse a change made against a view someone else has since
 * changed. Refusals — the last admin, a seller owner — show in place.
 */
export function RoleForm({
  current,
  roles,
  action,
}: {
  current: BackendRole;
  roles: BackendRole[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="expectedRole" value={current} />

      <div className="space-y-1.5">
        <Label htmlFor="user-role">Role</Label>
        <SelectField
          id="user-role"
          name="role"
          defaultValue={current}
          options={roles.map((role) => ({
            value: role,
            label: roleLabel(role),
          }))}
          aria-invalid={state.fieldErrors?.role ? true : undefined}
        />
        <FieldError messages={state.fieldErrors?.role} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="role-reason">Reason (optional)</Label>
        <Textarea
          id="role-reason"
          name="reason"
          rows={2}
          maxLength={500}
          placeholder="Kept with the change in the audit log."
          aria-invalid={state.fieldErrors?.reason ? true : undefined}
        />
        <FieldError messages={state.fieldErrors?.reason} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Changing…">Change role</SubmitButton>
        {state.status === 'idle' && state.message ? (
          <span className="text-muted-foreground text-xs" role="status">
            {state.message}
          </span>
        ) : null}
      </div>

      <FieldError messages={state.fieldErrors?.expectedRole} />
      <FormError state={state} />
    </form>
  );
}
