'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import type { FormState } from '@/lib/form';

/**
 * Cancelling an unpaid order, or stopping its payment.
 *
 * Both are one-way, so each asks once more before acting. Stopping a
 * payment is offered separately because it is what a shopper who started a
 * mobile money prompt by mistake actually wants — and once the gateway
 * confirms it, the order is cancelled along with it.
 */
export function OrderActions({
  cancelOrder,
  cancelPayment,
}: {
  cancelOrder?: () => Promise<FormState>;
  cancelPayment?: () => Promise<FormState>;
}) {
  const [confirming, setConfirming] = useState<'order' | 'payment' | null>(
    null,
  );
  const [result, setResult] = useState<FormState | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!cancelOrder && !cancelPayment) {
    return null;
  }

  function run(action: () => Promise<FormState>): void {
    startTransition(async () => {
      setResult(await action());
      setConfirming(null);
    });
  }

  const pendingAction = confirming === 'order' ? cancelOrder : cancelPayment;

  return (
    <div className="space-y-2">
      {confirming && pendingAction ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            {confirming === 'order'
              ? 'Cancel this order? Its items go back on sale.'
              : 'Stop this payment? Nothing further will be charged.'}
          </span>
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() => run(pendingAction)}
          >
            {isPending ? 'Cancelling…' : 'Yes, cancel'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => setConfirming(null)}
          >
            Keep it
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {cancelOrder ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirming('order')}
            >
              Cancel order
            </Button>
          ) : null}
          {cancelPayment ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming('payment')}
            >
              Stop payment
            </Button>
          ) : null}
        </div>
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
