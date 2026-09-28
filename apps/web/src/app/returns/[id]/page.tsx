import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ApiError } from '@commerce/api-client';

import { cancelReturnAction } from '@/app/orders/actions';
import { ApiErrorNotice } from '@/components/api-error-notice';
import { TimelineList } from '@/components/order-shipping-timeline';
import { OrderSignInPrompt } from '@/components/order-sign-in-prompt';
import { ReturnCancelButton } from '@/components/return-cancel-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { labelOffers, type OfferLabel } from '@/lib/cart';
import { formatMinor } from '@/lib/currency';
import { getOrder } from '@/lib/orders';
import {
  buildReturnTimeline,
  isReturnCancellable,
  REFUND_CASE_STATUS_LABELS,
  RETURN_REASON_LABELS,
  RETURN_STATUS_LABELS,
  returnStatusTone,
  summarizeRefund,
  type ReturnRequest,
} from '@/lib/return-types';
import { getReturn } from '@/lib/returns';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Return',
};

/** Null when it is not the caller's (the API's 404), or the id is not even
 * a UUID (its 400) — both are "no such return" to the person looking. */
async function loadOwnReturn(id: string): Promise<ReturnRequest | null> {
  try {
    return await getReturn(id);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 400)
    ) {
      return null;
    }
    throw error;
  }
}

/** Names for the return's lines, by order item id, via the order they came
 * from. Best-effort: the return reads fine with "Item" in their place. */
async function labelItems(
  request: ReturnRequest,
): Promise<Map<string, OfferLabel>> {
  try {
    const order = await getOrder(request.orderId);
    const labels = await labelOffers(order.items.map((item) => item.offerId));
    return new Map(
      order.items.flatMap((item) => {
        const label = labels.get(item.offerId);
        return label ? [[item.id, label] as const] : [];
      }),
    );
  } catch {
    return new Map();
  }
}

export default async function ReturnPage({
  params,
  searchParams,
}: PageProps<'/returns/[id]'>) {
  const { id } = await params;
  const { requested } = await searchParams;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <OrderSignInPrompt title="Return" message="Sign in to see this return." />
    );
  }

  let request;
  let labels;

  try {
    request = await loadOwnReturn(id);
    labels = request ? await labelItems(request) : null;
  } catch (error) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Return</h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  if (!request || !labels) {
    notFound();
  }

  const refund = summarizeRefund(request);
  const refundCases = request.refundCases.filter(
    (refundCase) => refundCase.status !== 'CANCELLED',
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/returns">
          <ArrowLeft data-icon="inline-start" />
          Your returns
        </Link>
      </Button>

      {requested === '1' ? (
        <div
          role="status"
          className="rounded-2xl border border-dashed px-4 py-3 text-sm"
        >
          <p className="font-medium">Return requested</p>
          <p className="text-muted-foreground text-pretty">
            We’ll review it and let you know. Once approved, this page shows
            your return number and how to send the items back.
          </p>
        </div>
      ) : null}

      <div className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          Return{' '}
          <span className="font-mono">
            {request.rmaNumber ?? request.id.slice(0, 8)}
          </span>
          <Badge variant={returnStatusTone(request.status)}>
            {RETURN_STATUS_LABELS[request.status] ?? request.status}
          </Badge>
        </h1>
        <p className="text-muted-foreground text-sm">
          For order{' '}
          <Link
            href={`/orders/${request.orderId}`}
            className="font-mono hover:underline"
          >
            {request.orderId.slice(0, 8)}
          </Link>
        </p>
      </div>

      {request.rmaNumber && request.rmaInstructions ? (
        <Card>
          <CardContent className="space-y-2">
            <h2 className="text-base font-semibold">How to send it back</h2>
            <p className="text-sm">
              Return number{' '}
              <span className="font-mono font-medium">{request.rmaNumber}</span>{' '}
              — include it with the parcel.
            </p>
            <p className="text-muted-foreground text-sm whitespace-pre-line text-pretty">
              {request.rmaInstructions}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-base font-semibold">Progress</h2>
            <TimelineList steps={buildReturnTimeline(request)} />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardContent className="space-y-3">
            <h2 className="text-base font-semibold">Refund</h2>
            {refund ? (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {refund.estimated ? 'Estimated' : 'Total'}
                </span>
                <span className="font-medium">
                  {formatMinor(refund.amount, refund.currency)}
                </span>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No refund is due on this return.
              </p>
            )}
            {refundCases.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {refundCases.map((refundCase) => (
                  <li key={refundCase.id} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {REFUND_CASE_STATUS_LABELS[refundCase.status] ??
                        refundCase.status}
                    </span>
                    <span>
                      {formatMinor(refundCase.amount, refundCase.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : refund?.estimated ? (
              <p className="text-muted-foreground text-xs text-pretty">
                The items’ price, before any shipping refund. The final
                amount is set once they’ve been inspected, and goes back to
                how you paid.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-base font-semibold">Items</h2>
          <ul className="space-y-3">
            {request.items.map((item, index) => (
              <li key={item.id} className="space-y-3">
                {index > 0 ? <Separator /> : null}
                <div className="flex justify-between gap-4 text-sm">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">
                      {labels.get(item.orderItemId)?.name ?? 'Item'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {item.quantity} ×{' '}
                      {formatMinor(item.unitAmount, item.currency)} ·{' '}
                      {RETURN_REASON_LABELS[item.reasonCode] ?? item.reasonCode}
                    </p>
                    {item.note ? (
                      <p className="text-muted-foreground text-xs text-pretty">
                        “{item.note}”
                      </p>
                    ) : null}
                  </div>
                  <span className="font-medium">
                    {formatMinor(item.unitAmount * item.quantity, item.currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {isReturnCancellable(request) ? (
        <ReturnCancelButton
          cancel={cancelReturnAction.bind(null, request.id, request.version)}
        />
      ) : null}
    </div>
  );
}
