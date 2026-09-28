import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { OrderSignInPrompt } from '@/components/order-sign-in-prompt';
import {
  ReturnRequestForm,
  type ReturnFormLine,
} from '@/components/return-request-form';
import { Button } from '@/components/ui/button';
import { labelOffers } from '@/lib/cart';
import { loadOwnOrder } from '@/lib/orders';
import { getReturnEligibility } from '@/lib/returns';
import { getCurrentUser } from '@/lib/session';

import { requestReturnAction } from '../../actions';

export const metadata: Metadata = {
  title: 'Request a return',
};

/**
 * Choosing what to send back from one order. Eligibility is read fresh —
 * a window may have closed, or another return claimed units, since the
 * order page was loaded — and read again by the action on submit.
 */
export default async function RequestReturnPage({
  params,
}: PageProps<'/orders/[id]/return'>) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <OrderSignInPrompt
        title="Request a return"
        message="Sign in to return something from this order."
      />
    );
  }

  let order;
  let eligibility;
  let labels;

  try {
    order = await loadOwnOrder(id);
    if (order) {
      [eligibility, labels] = await Promise.all([
        getReturnEligibility(order.id),
        labelOffers(order.items.map((item) => item.offerId)),
      ]);
    }
  } catch (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Request a return
        </h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  if (!order || !eligibility || !labels) {
    notFound();
  }

  const byItem = new Map(eligibility.map((line) => [line.orderItemId, line]));
  const lines: ReturnFormLine[] = order.items.map((item) => {
    const line = byItem.get(item.id);
    const label = labels.get(item.offerId);
    const maxQuantity = line?.returnable
      ? Math.max(0, line.totalRemainingQuantity)
      : 0;
    return {
      orderItemId: item.id,
      name: label?.name ?? 'Item',
      imageUrl: label?.imageUrl ?? null,
      unitAmount: item.unitAmount,
      currency: item.currency,
      maxQuantity,
      returnBy:
        line?.chunks
          .map((chunk) => chunk.eligibleUntil)
          .sort((a, b) => Date.parse(a) - Date.parse(b))
          .at(0) ?? null,
      unavailableReason:
        maxQuantity > 0
          ? null
          : (line?.reason ??
            (line?.returnable
              ? 'Already being returned'
              : 'Can’t be returned')),
    };
  });
  const anyReturnable = lines.some((line) => line.maxQuantity > 0);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/orders/${order.id}`}>
          <ArrowLeft data-icon="inline-start" />
          Back to order
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Request a return
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          From order{' '}
          <span className="text-foreground font-mono">
            {order.id.slice(0, 8)}
          </span>
          . Once it’s approved you’ll get a return number and instructions for
          sending the items back.{' '}
          <Link href="/help#returns" className="underline">
            Returns policy
          </Link>
        </p>
      </div>

      {anyReturnable ? (
        <ReturnRequestForm
          lines={lines}
          action={requestReturnAction.bind(null, order.id)}
        />
      ) : (
        <p className="text-muted-foreground rounded-2xl border border-dashed px-4 py-3 text-sm text-pretty">
          Nothing on this order can be returned right now. Items become
          returnable once they’ve been delivered, for as long as their return
          window lasts.
        </p>
      )}
    </div>
  );
}
