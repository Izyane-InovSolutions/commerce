'use client';

import { useActionState, useId } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';
import type { ModerationDecision } from '@/lib/moderation';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const DECISION_BUTTONS: Record<
  ModerationDecision,
  { label: string; variant: 'default' | 'outline' }
> = {
  approve: { label: 'Approve', variant: 'default' },
  hide: { label: 'Hide', variant: 'outline' },
  restore: { label: 'Restore', variant: 'outline' },
  remove: { label: 'Remove', variant: 'outline' },
};

function Outcome({ state }: { state: FormState }) {
  return (
    <>
      {state.status === 'idle' && state.message ? (
        <span className="text-muted-foreground text-xs" role="status">
          {state.message}
        </span>
      ) : null}
      <FormError state={state} />
    </>
  );
}

/**
 * The decisions a review can take from where it stands, sharing one reason.
 *
 * `decisions` comes from `moderationDecisionsFor`, so the buttons are only
 * the ones the API would accept. The reason is optional in the markup because
 * an approval records none; the action insists on one for everything else.
 */
export function ModerationDecisionForm({
  action,
  version,
  decisions,
}: {
  action: Action;
  /** The version this page read; a stale one is refused by the API. */
  version: number;
  decisions: ModerationDecision[];
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldId = useId();

  if (decisions.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No further decision applies — removed and withdrawn reviews are final.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="version" value={version} />

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-reason`} className="text-xs">
          Reason
        </Label>
        <Textarea
          id={`${fieldId}-reason`}
          name="reason"
          rows={2}
          maxLength={1000}
          placeholder="Needed to hide, remove or restore; recorded with the decision."
          aria-invalid={state.fieldErrors?.reason ? true : undefined}
        />
        <FieldError messages={state.fieldErrors?.reason} />
        <FieldError messages={state.fieldErrors?.version} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {decisions.map((decision) => (
          <SubmitButton
            key={decision}
            name="decision"
            value={decision}
            variant={DECISION_BUTTONS[decision].variant}
            pendingLabel="Submitting…"
          >
            {DECISION_BUTTONS[decision].label}
          </SubmitButton>
        ))}
        <Outcome state={state} />
      </div>
    </form>
  );
}

/**
 * Dismisses one open report, leaving the review as it is. The reason goes on
 * the report as its resolution note.
 */
export function DismissReportForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldId = useId();

  return (
    <form action={formAction} className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-reason`} className="text-xs">
          Why dismiss it
        </Label>
        <Textarea
          id={`${fieldId}-reason`}
          name="reason"
          rows={1}
          required
          maxLength={1000}
          aria-invalid={state.fieldErrors?.reason ? true : undefined}
        />
        <FieldError messages={state.fieldErrors?.reason} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton variant="secondary" pendingLabel="Dismissing…">
          Dismiss report
        </SubmitButton>
        <Outcome state={state} />
      </div>
    </form>
  );
}
