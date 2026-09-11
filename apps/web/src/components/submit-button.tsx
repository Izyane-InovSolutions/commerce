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
}: {
  children: ReactNode;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (pendingLabel ?? 'Saving…') : children}
    </Button>
  );
}
