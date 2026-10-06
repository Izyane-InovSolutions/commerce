import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { OfferLabel } from '@/lib/cart';
import type { Order } from '@/lib/commerce-types';
import { formatMinor } from '@/lib/currency';
import {
  RETURN_STATUS_LABELS,
  returnStatusTone,
  summarizeRefund,
  type ReturnRequest,
} from '@/lib/return-types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * A return item names only the order line it came from, and an order line
 * only its offer — so naming one goes through the orders.
 */
export function labelReturnItems(
  orders: Order[],
  labels: Map<string, OfferLabel>,
): Map<string, OfferLabel> {
  return new Map(
    orders.flatMap((order) =>
      order.items.flatMap((item) => {
        const label = labels.get(item.offerId);
        return label ? [[item.id, label] as const] : [];
      }),
    ),
  );
}

/**
 * The customer's returns, each with its progress and refund. Shared by the
 * returns page and the account page's Returns tab.
 */
export function ReturnsList({
  returns,
  itemLabels,
}: {
  returns: ReturnRequest[];
  /** Keyed by order item id; an unlabelled item reads as "Item". */
  itemLabels: Map<string, OfferLabel>;
}) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm text-pretty">
        To send something back, open the order it came from and choose
        “Request a return”.{' '}
        <Link href="/help#returns" className="underline">
          Returns policy
        </Link>
      </p>

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
                          {itemLabels.get(item.orderItemId)?.name ?? 'Item'} ×{' '}
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
