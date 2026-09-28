'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import type { FormState } from '@/lib/form';

/**
 * Withdrawing a return nobody has acted on yet. One-way, so it asks once
 * more first — the same pattern as cancelling an order (`OrderActions`).
 */
export function ReturnCancelButton({
  cancel,
}: {
  cancel: () => Promise<FormState>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<FormState | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Cancel this return? You can request a new one later.</span>
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setResult(await cancel());
                setConfirming(false);
              })
            }
          >
            {isPending ? 'Cancelling…' : 'Yes, cancel'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => setConfirming(false)}
          >
            Keep it
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
          Cancel return
        </Button>
      )}
      {result?.message ? (
        <p
          role={result.status === 'error' ? 'alert' : 'status'}
          className={
            result.status === 'error'
              ? 'text-destructive text-xs'
              : 'text-muted-foreground text-xs'
          }
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
