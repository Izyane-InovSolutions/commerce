'use client';

import { useEffect, useState, useTransition } from 'react';

import { getOrderShipmentsAction } from '@/app/account/actions';
import { OrderShippingTimeline } from '@/components/order-shipping-timeline';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { formatMinor } from '@/lib/currency';
import { STATUS_LABELS } from '@/lib/order-status-labels';
import type { OrderShipment } from '@/lib/commerce-types';

import type { OrderCard } from './orders-filter-list';

function formatDatestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * An order's full detail, opened from its card in the orders list — the
 * shipping timeline is the one thing worth a dedicated fetch, since it isn't
 * needed until someone actually wants to see how far their order has got.
 */
export function OrderDetailModal({
  order,
  onOpenChange,
}: {
  order: OrderCard | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [shipments, setShipments] = useState<OrderShipment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!order) {
      return;
    }

    setShipments([]);
    setError(null);
    startTransition(async () => {
      const result = await getOrderShipmentsAction(order.id);
      if ('error' in result) {
        setError(result.error);
      } else {
        setShipments(result.shipments);
      }
    });
  }, [order]);

  return (
    <Dialog open={order !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {order ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                Order {order.id.slice(0, 8)}
                <Badge variant={order.status === 'PAID' ? 'default' : 'secondary'}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </Badge>
              </DialogTitle>
              <p className="text-muted-foreground text-xs">
                Placed {formatDatestamp(order.createdAt)}
              </p>
            </DialogHeader>

            <ul className="space-y-2">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {item.name} × {item.quantity}
                  </span>
                  <span>{formatMinor(item.lineTotal, item.currency)}</span>
                </li>
              ))}
            </ul>

            <Separator />

            <div className="flex justify-between text-sm font-semibold">
              <span>Total</span>
              <span>{formatMinor(order.total, order.currency)}</span>
            </div>

            <Separator />

            <div>
              <p className="mb-3 text-sm font-medium">Shipping status</p>
              {isPending ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : error ? (
                <p className="text-destructive text-sm">{error}</p>
              ) : (
                <OrderShippingTimeline order={order} shipments={shipments} />
              )}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
