'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Submit button that disables itself while its form is in flight, so a slow
 * request cannot be submitted twice.
 *
 * Full width by default, which is what the page-level forms want; inline uses
 * — a quantity stepper, say — pass their own width.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant,
  size,
  className,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      className={cn(size === undefined && 'w-full', className)}
    >
      {pending ? (pendingLabel ?? 'Saving…') : children}
    </Button>
  );
}
