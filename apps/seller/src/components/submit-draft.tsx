'use client';

import { useActionState } from 'react';

import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { idleFormState, type FormState } from '@/lib/form';

/** Sends a draft to an administrator for review. */
export function SubmitDraft({ action }: { action: () => Promise<FormState> }) {
  const [state, formAction] = useActionState<FormState>(action, idleFormState);

  return (
    <Card className="border-primary/40 max-w-2xl">
      <CardHeader>
        <CardTitle>This is still a draft</CardTitle>
        <CardDescription>
          Shoppers cannot see it and it is not in the review queue yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <form action={formAction}>
          <SubmitButton pendingLabel="Sending…">Send for review</SubmitButton>
        </form>
        <FormError state={state} />
      </CardContent>
    </Card>
  );
}
