'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { OrderDetailModal } from '@/components/order-detail-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatMinor } from '@/lib/currency';
import { STATUS_LABELS } from '@/lib/order-status-labels';
import type { FulfillmentSummary, OrderStatus } from '@/lib/commerce-types';

export { STATUS_LABELS } from '@/lib/order-status-labels';

/** Every real order status, in the order the filter bar lists them. */
const FILTERABLE_STATUSES: OrderStatus[] = [
  'PENDING_PAYMENT',
  'PAID',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
];

/** A shown badge only for the fulfillment states worth calling out — not the
 * default "nothing has moved yet" or "cancelled" (already covered by the
 * order's own status badge). */
const FULFILLMENT_LABELS: Partial<Record<FulfillmentSummary, string>> = {
  PARTIALLY_DISPATCHED: 'Partially shipped',
  DISPATCHED: 'Shipped',
};

/** A distinct filter dimension from `OrderStatus`: an order can be PAID and
 * still be preparing, partially shipped, or fully shipped. */
type FilterValue = 'all' | OrderStatus | 'SHIPPED';

function isShipped(order: OrderCard): boolean {
  return (
    order.fulfillmentSummary === 'DISPATCHED' ||
    order.fulfillmentSummary === 'PARTIALLY_DISPATCHED'
  );
}

export type OrderCardItem = {
  id: string;
  name: string;
  quantity: number;
  lineTotal: number;
  currency: string;
};

/** Everything `OrdersList` resolves server-side before handing off — plain
 * data only, since offer names come from a `Map` that cannot cross into a
 * client component. */
export type OrderCard = {
  id: string;
  createdAt: string;
  status: OrderStatus;
  paymentNote: string | null;
  items: OrderCardItem[];
  subtotal: number;
  shippingAmount: number;
  total: number;
  currency: string;
  fulfillmentSummary?: FulfillmentSummary;
};

function formatDatestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The orders list, filterable by status — shared by the standalone orders
 * page and the account page's Orders tab via `OrdersList`. */
export function OrdersFilterList({ orders }: { orders: OrderCard[] }) {
  const [filter, setFilter] = useState<FilterValue>('all');
  const [selected, setSelected] = useState<OrderCard | null>(null);

  const counts = useMemo(() => {
    const byStatus: Partial<Record<OrderStatus, number>> = {};
    let shipped = 0;
    for (const order of orders) {
      byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
      if (isShipped(order)) shipped += 1;
    }
    return { byStatus, shipped };
  }, [orders]);

  const filtered =
    filter === 'all'
      ? orders
      : filter === 'SHIPPED'
        ? orders.filter(isShipped)
        : orders.filter((order) => order.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant={filter === 'all' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 text-xs font-medium"
          onClick={() => setFilter('all')}
        >
          All ({orders.length})
        </Button>
        {FILTERABLE_STATUSES.map((status) => (
          <Button
            key={status}
            type="button"
            variant={filter === status ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 text-xs font-medium"
            onClick={() => setFilter(status)}
          >
            {STATUS_LABELS[status]} ({counts.byStatus[status] ?? 0})
          </Button>
        ))}
        <Button
          type="button"
          variant={filter === 'SHIPPED' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 text-xs font-medium"
          onClick={() => setFilter('SHIPPED')}
        >
          Shipped ({counts.shipped})
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-sm">
          No orders match this filter.
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((order) => (
            <li key={order.id}>
              <Card
                role="button"
                tabIndex={0}
                onClick={() => setSelected(order)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(order);
                  }
                }}
                className="cursor-pointer transition-shadow hover:ring-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs">
                        {order.id.slice(0, 8)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatDatestamp(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {order.fulfillmentSummary &&
                      FULFILLMENT_LABELS[order.fulfillmentSummary] ? (
                        <Badge variant="outline">
                          {FULFILLMENT_LABELS[order.fulfillmentSummary]}
                        </Badge>
                      ) : null}
                      <Badge
                        variant={
                          order.status === 'PAID' ? 'default' : 'secondary'
                        }
                      >
                        {STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                    </div>
                  </div>

                  {order.paymentNote ? (
                    <p className="text-muted-foreground text-xs text-pretty">
                      {order.paymentNote}
                    </p>
                  ) : null}

                  <ul className="space-y-2">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex justify-between gap-3 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {item.name} × {item.quantity}
                        </span>
                        <span>{formatMinor(item.lineTotal, item.currency)}</span>
                      </li>
                    ))}
                  </ul>

                  <Separator />

                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatMinor(order.subtotal, order.currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Shipping</span>
                      <span>
                        {order.shippingAmount === 0
                          ? 'Free'
                          : formatMinor(order.shippingAmount, order.currency)}
                      </span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span>{formatMinor(order.total, order.currency)}</span>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <OrderDetailModal
        order={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}

/** Shown instead of the filter bar and list when there are no orders at all. */
export function EmptyOrdersState() {
  return (
    <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
      <p className="font-medium">No orders yet</p>
      <p className="text-muted-foreground text-sm">
        Anything you buy shows up here.
      </p>
      <Button asChild size="sm">
        <Link href="/products">Browse products</Link>
      </Button>
    </div>
  );
}
