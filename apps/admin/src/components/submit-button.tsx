'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

/**
 * Submit button that disables itself while its form is in flight, so a slow
 * request cannot be submitted twice.
 */
export function SubmitButton({
  children,
  pendingLabel,
  name,
  value,
  variant,
}: {
  children: ReactNode;
  pendingLabel?: string;
  /** Posted with the form, so an action can tell which button was pressed. */
  name?: string;
  value?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      name={name}
      value={value}
      variant={variant}
      disabled={pending}
    >
      {pending ? (pendingLabel ?? 'Saving…') : children}
    </Button>
  );
}
