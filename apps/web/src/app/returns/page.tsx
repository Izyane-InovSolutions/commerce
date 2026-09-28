import type { Metadata } from 'next';
import Link from 'next/link';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { OrderSignInPrompt } from '@/components/order-sign-in-prompt';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { labelOffers, type OfferLabel } from '@/lib/cart';
import type { Order } from '@/lib/commerce-types';
import { formatMinor } from '@/lib/currency';
import { listOrders } from '@/lib/orders';
import {
  RETURN_STATUS_LABELS,
  returnStatusTone,
  summarizeRefund,
} from '@/lib/return-types';
import { listReturns } from '@/lib/returns';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Returns',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * A return item names only the order line it came from, and an order line
 * only its offer — so naming one goes through the orders. Best-effort: a
 * list of returns is still useful with "Item" where a name would be.
 */
async function labelReturnItems(): Promise<Map<string, OfferLabel>> {
  let orders: Order[];
  let labels: Map<string, OfferLabel>;
  try {
    orders = await listOrders();
    labels = await labelOffers(
      orders.flatMap((order) => order.items.map((item) => item.offerId)),
    );
  } catch {
    return new Map();
  }

  const offerByItem = new Map(
    orders.flatMap((order) =>
      order.items.map((item) => [item.id, item.offerId] as const),
    ),
  );
  return new Map(
    [...offerByItem].flatMap(([itemId, offerId]) => {
      const label = labels.get(offerId);
      return label ? [[itemId, label] as const] : [];
    }),
  );
}

export default async function ReturnsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <OrderSignInPrompt
        title="Returns"
        message="Sign in to see the returns you’ve requested."
      />
    );
  }

  let returns;
  let labels;

  try {
    [returns, labels] = await Promise.all([listReturns(), labelReturnItems()]);
  } catch (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Returns</h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Returns</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          To send something back, open the order it came from and choose
          “Request a return”.{' '}
          <Link href="/help#returns" className="underline">
            Returns policy
          </Link>
        </p>
      </div>

      {returns.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed px-4 py-6 text-center">
          <p className="text-sm font-medium">No returns yet</p>
          <p className="text-muted-foreground text-sm">
            Returns you request will show up here, with their progress through
            to your refund.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/account?tab=orders">Your orders</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {returns.map((request) => {
            const refund = summarizeRefund(request);
            return (
              <li key={request.id}>
                <Card>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/returns/${request.id}`}
                        className="font-medium hover:underline"
                      >
                        Return {request.rmaNumber ?? request.id.slice(0, 8)}
                      </Link>
                      <Badge variant={returnStatusTone(request.status)}>
                        {RETURN_STATUS_LABELS[request.status] ?? request.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Requested {formatDate(request.createdAt)} · Order{' '}
                      <Link
                        href={`/orders/${request.orderId}`}
                        className="font-mono hover:underline"
                      >
                        {request.orderId.slice(0, 8)}
                      </Link>
                    </p>
                    <ul className="text-sm">
                      {request.items.map((item) => (
                        <li key={item.id} className="text-muted-foreground">
                          {labels.get(item.orderItemId)?.name ?? 'Item'} ×{' '}
                          {item.quantity}
                        </li>
                      ))}
                    </ul>
                    {refund ? (
                      <p className="text-sm">
                        {refund.estimated ? 'Estimated refund' : 'Refund'}{' '}
                        <span className="font-medium">
                          {formatMinor(refund.amount, refund.currency)}
                        </span>
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
