'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatMinor } from '@/lib/currency';
import type { OrderStatus } from '@/lib/commerce-types';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
  PARTIALLY_REFUNDED: 'Partially refunded',
  REFUNDED: 'Refunded',
};

/** Every real order status, in the order the filter bar lists them. */
const FILTERABLE_STATUSES: OrderStatus[] = [
  'PENDING_PAYMENT',
  'PAID',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
];

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
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');

  const counts = useMemo(() => {
    const byStatus: Partial<Record<OrderStatus, number>> = {};
    for (const order of orders) {
      byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
    }
    return byStatus;
  }, [orders]);

  const filtered =
    statusFilter === 'all'
      ? orders
      : orders.filter((order) => order.status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant={statusFilter === 'all' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 text-xs font-medium"
          onClick={() => setStatusFilter('all')}
        >
          All ({orders.length})
        </Button>
        {FILTERABLE_STATUSES.map((status) => (
          <Button
            key={status}
            type="button"
            variant={statusFilter === status ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 text-xs font-medium"
            onClick={() => setStatusFilter(status)}
          >
            {STATUS_LABELS[status]} ({counts[status] ?? 0})
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-sm">
          No orders match this filter.
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((order) => (
            <li key={order.id}>
              <Card>
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
                    <Badge
                      variant={order.status === 'PAID' ? 'default' : 'secondary'}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
                    </Badge>
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
