'use client';

import { useActionState } from 'react';
import Link from 'next/link';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';
import type {
  PurchaseOrderAction,
  PurchaseOrderActionState,
} from '@/lib/procurement';

type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

const LABELS: Record<PurchaseOrderAction, string> = {
  edit: 'Edit draft',
  submit: 'Submit for approval',
  returnToDraft: 'Return to draft',
  approve: 'Approve',
  reject: 'Reject',
  place: 'Mark as ordered',
  cancel: 'Cancel order',
  closeShort: 'Close short',
  revise: 'Create revision',
  receive: 'Receive goods',
};

/** What each reason-taking action does, said before it is confirmed. */
const REASON_PROMPTS: Partial<Record<PurchaseOrderAction, string>> = {
  returnToDraft:
    'Sends it back to be changed and resubmitted. The reason goes in the audit trail.',
  reject:
    'Final — a rejected purchase order cannot be reopened. Raise a new one instead.',
  cancel: 'Final. Nothing has been received against it, so no stock moves.',
  closeShort:
    'Stops waiting for the rest: everything still outstanding is cancelled, and what has arrived stays.',
};

const VERSION_ONLY = new Set<PurchaseOrderAction>(['submit', 'approve', 'place']);

/** At most one of these is ever allowed at once. */
const FORWARD = new Set<PurchaseOrderAction>([
  'submit',
  'approve',
  'place',
  'receive',
]);

/**
 * A reason, then a confirm button — for every step the API refuses without
 * one. Collapsed until asked for, so the page reads as a list of choices
 * rather than a stack of text boxes.
 */
export function PurchaseOrderReasonForm({
  action,
  label,
  prompt,
  hidden,
  id,
}: {
  action: FormAction;
  label: string;
  prompt: string;
  /** Extra values the action needs, such as which transition this is. */
  hidden?: Record<string, string>;
  /** Unique on the page, for the textarea's label. */
  id: string;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <details className="group rounded-lg border">
      <summary className="hover:bg-muted cursor-pointer list-none rounded-lg px-3 py-1.5 text-sm font-medium group-open:rounded-b-none group-open:border-b">
        {label}
      </summary>
      <form action={formAction} className="space-y-3 p-3">
        {Object.entries(hidden ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <p className="text-muted-foreground text-sm text-pretty">{prompt}</p>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-reason`}>Reason</Label>
          <Textarea
            id={`${id}-reason`}
            name="reason"
            rows={2}
            required
            maxLength={1000}
            aria-invalid={state.fieldErrors?.reason ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.reason} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton variant="outline" pendingLabel="Saving…">
            {label}
          </SubmitButton>
          {state.status === 'idle' && state.message ? (
            <span className="text-muted-foreground text-xs" role="status">
              {state.message}
            </span>
          ) : null}
        </div>
        <FormError state={state} />
      </form>
    </details>
  );
}

function VersionOnlyButton({
  action,
  transition,
  primary,
}: {
  action: FormAction;
  transition: PurchaseOrderAction;
  primary: boolean;
}) {
  const [state, formAction] = useActionState(action, idleFormState);

  return (
    <form action={formAction} className="space-y-1.5">
      <input type="hidden" name="transition" value={transition} />
      <SubmitButton
        variant={primary ? 'default' : 'outline'}
        pendingLabel="Saving…"
      >
        {LABELS[transition]}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}

function ReviseButton({ action }: { action: () => Promise<FormState> }) {
  const [state, formAction] = useActionState(
    async () => action(),
    idleFormState,
  );

  return (
    <form action={formAction} className="space-y-1.5">
      <SubmitButton variant="outline" pendingLabel="Copying…">
        {LABELS.revise}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}

/**
 * The steps this purchase order's status allows, as `purchaseOrderActions`
 * worked them out. One the viewer can't take is still listed, disabled, with
 * the reason — an approver looking for the button learns why it isn't
 * there instead of assuming it is missing.
 */
export function PurchaseOrderActions({
  actions,
  transition,
  revise,
  editHref,
  receiveHref,
}: {
  actions: PurchaseOrderActionState[];
  /** Bound to the order and the version this page read. */
  transition: FormAction;
  revise: () => Promise<FormState>;
  editHref: string;
  receiveHref: string;
}) {
  if (actions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        This purchase order is closed. Nothing more can be done to it.
      </p>
    );
  }

  const available = actions.filter((entry) => !entry.blockedReason);
  const blocked = actions.filter((entry) => entry.blockedReason);
  // The step that moves the order forward gets the primary button.
  const primary = available.find((entry) =>
    FORWARD.has(entry.action),
  )?.action;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        {available
          .filter((entry) => !REASON_PROMPTS[entry.action])
          .map(({ action }) => {
            if (action === 'edit' || action === 'receive') {
              return (
                <Button
                  key={action}
                  variant={action === primary ? 'default' : 'outline'}
                  asChild
                >
                  <Link href={action === 'edit' ? editHref : receiveHref}>
                    {LABELS[action]}
                  </Link>
                </Button>
              );
            }
            if (action === 'revise') {
              return <ReviseButton key={action} action={revise} />;
            }
            if (VERSION_ONLY.has(action)) {
              return (
                <VersionOnlyButton
                  key={action}
                  action={transition}
                  transition={action}
                  primary={action === primary}
                />
              );
            }
            return null;
          })}
      </div>

      {available
        .filter((entry) => REASON_PROMPTS[entry.action])
        .map(({ action }) => (
          <PurchaseOrderReasonForm
            key={action}
            id={`po-${action}`}
            action={transition}
            label={LABELS[action]}
            prompt={REASON_PROMPTS[action]!}
            hidden={{ transition: action }}
          />
        ))}

      {blocked.length > 0 ? (
        <ul className="space-y-1.5">
          {blocked.map(({ action, blockedReason }) => (
            <li key={action} className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled>
                {LABELS[action]}
              </Button>
              <span className="text-muted-foreground text-xs">
                {blockedReason}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
