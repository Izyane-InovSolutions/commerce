import { OrderStatusPoller } from '@/components/order-status-poller';
import { cn } from '@/lib/utils';
import type { PaymentState } from '@/lib/order-payment-state';

const TONE_CLASSES: Record<PaymentState['tone'], string> = {
  success: 'border-emerald-600/30 bg-emerald-50 dark:bg-emerald-950/40',
  waiting: 'border-dashed',
  problem: 'border-destructive/40 bg-destructive/10',
  neutral: '',
};

/**
 * Where the payment behind an order stands, and — while it is still moving —
 * the same polling the orders list uses, so the page settles by itself once
 * the gateway does.
 */
export function OrderPaymentStatus({ state }: { state: PaymentState }) {
  return (
    <div
      className={cn(
        'space-y-1 rounded-2xl border px-4 py-3 text-sm',
        TONE_CLASSES[state.tone],
      )}
    >
      <p
        className={cn(
          'font-medium',
          state.tone === 'problem' && 'text-destructive',
        )}
      >
        {state.title}
      </p>
      {state.detail ? (
        <p className="text-muted-foreground text-pretty">{state.detail}</p>
      ) : null}
      {state.awaiting ? <OrderStatusPoller /> : null}
    </div>
  );
}
