import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  ApiError,
  backendGetAdminOrder,
  backendListFulfillments,
  backendListShipments,
} from '@commerce/api-client';
import type {
  BackendFulfillmentOrder,
  BackendShipment,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { FulfillmentActionButton } from '@/components/fulfillment-action-button';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api';
import type { FormState } from '@/lib/form';
import { formatMinor } from '@/lib/money';
import { requireAdmin } from '@/lib/session';

import {
  completePackingAction,
  completePickingAction,
  dispatchAction,
  markShipmentDeliveredAction,
  shipItAction,
  startPackingAction,
  startPickingAction,
} from '../actions';

/** Mirrors `isTerminalShipmentStatus` in the shipments service — a shipment
 * in one of these has nothing left for a manual override to do. */
const TERMINAL_SHIPMENT_STATUSES = new Set([
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURN_TO_SENDER',
  'RETURNED',
  'CANCELLED',
]);

export async function generateMetadata({
  params,
}: PageProps<'/orders/[id]'>): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order ${id.slice(0, 8)}` };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Whichever booked shipment for this fulfillment order hasn't dispatched yet. */
function bookedShipment(
  shipments: BackendShipment[],
  fulfillmentOrderId: string,
): BackendShipment | null {
  return (
    shipments.find(
      (shipment) =>
        shipment.fulfillmentOrderId === fulfillmentOrderId &&
        shipment.status === 'BOOKED',
    ) ?? null
  );
}

/**
 * The one next action this fulfillment order is waiting on — a warehouse
 * queue rather than a full pick/pack UI, since this is an admin order view,
 * not a scanner app. `DISPATCHED`, `CANCELLED`, and their partial-cancel
 * sibling have nothing left to do here.
 */
function nextAction(
  fo: BackendFulfillmentOrder,
  orderId: string,
  shipments: BackendShipment[],
): { label: string; pendingLabel: string; action: () => Promise<FormState> } | null {
  switch (fo.status) {
    case 'READY_TO_PICK':
      return {
        label: 'Start picking',
        pendingLabel: 'Starting…',
        action: startPickingAction.bind(null, orderId, fo.id),
      };
    case 'PICKING':
    case 'PARTIALLY_PICKED':
      return {
        label: 'Complete picking',
        pendingLabel: 'Recording…',
        action: completePickingAction.bind(null, orderId, fo.id),
      };
    case 'PICKED':
      return {
        label: 'Start packing',
        pendingLabel: 'Starting…',
        action: startPackingAction.bind(null, orderId, fo.id),
      };
    case 'PACKING':
    case 'PARTIALLY_PACKED':
      return {
        label: 'Complete packing',
        pendingLabel: 'Recording…',
        action: completePackingAction.bind(null, orderId, fo.id),
      };
    case 'PACKED':
    case 'PARTIALLY_DISPATCHED': {
      const booked = bookedShipment(shipments, fo.id);
      return booked
        ? {
            label: `Dispatch ${booked.shipmentNumber}`,
            pendingLabel: 'Dispatching…',
            action: dispatchAction.bind(null, orderId, fo.id, booked.id),
          }
        : {
            label: 'Ship it',
            pendingLabel: 'Booking…',
            action: shipItAction.bind(null, orderId, fo.id),
          };
    }
    default:
      return null;
  }
}

export default async function AdminOrderPage({
  params,
}: PageProps<'/orders/[id]'>) {
  await requireAdmin();
  const { id } = await params;

  let order;
  try {
    order = await backendGetAdminOrder(apiClient, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Order" description="Items, payment, and shipping." />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  // Both reads are separate from the order itself so a fulfillment/shipment
  // read failure leaves the order's own details — items, payment — still
  // visible, rather than taking the whole page down with it.
  let fulfillments: BackendFulfillmentOrder[] = [];
  let shipments: BackendShipment[] = [];
  try {
    const foPage = await backendListFulfillments(apiClient, {
      orderId: id,
      limit: 50,
    });
    fulfillments = foPage.items;
    if (fulfillments.length > 0) {
      const shipmentLists = await Promise.all(
        fulfillments.map((fo) =>
          backendListShipments(apiClient, { fulfillmentOrderId: fo.id, limit: 20 }),
        ),
      );
      shipments = shipmentLists.flatMap((page) => page.items);
    }
  } catch {
    fulfillments = [];
    shipments = [];
  }

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/orders">
            <ArrowLeft data-icon="inline-start" />
            All orders
          </Link>
        </Button>
      </div>

      <PageHeader
        title={`Order ${order.id.slice(0, 8)}`}
        description={`Placed ${formatDate(order.createdAt)}.`}
        action={<StatusBadge status={order.status.toLowerCase()} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>
            Every line names its offer, not a product — the catalog is where
            that resolves.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Offer</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">
                      {item.offerId.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMinor(item.lineTotal, item.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs">Subtotal</dt>
              <dd>{formatMinor(order.subtotal, order.currency)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Shipping</dt>
              <dd>{formatMinor(order.shippingAmount, order.currency)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Total</dt>
              <dd className="font-medium">
                {formatMinor(order.total, order.currency)}
              </dd>
            </div>
          </dl>

          {order.payment ? (
            <p className="text-muted-foreground text-sm">
              Payment: <StatusBadge status={order.payment.status.toLowerCase()} />
              {order.payment.failureReason
                ? ` — ${order.payment.failureReason}`
                : null}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipping</CardTitle>
          <CardDescription>
            One card per warehouse slice of this order — a seller split across
            fulfillment modes has more than one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fulfillments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing to fulfil yet — this order has no fulfillment orders,
              which is normal before payment is confirmed.
            </p>
          ) : (
            fulfillments.map((fo) => {
              const next = nextAction(fo, order.id, shipments);
              const foShipments = shipments.filter(
                (shipment) => shipment.fulfillmentOrderId === fo.id,
              );
              return (
                <div
                  key={fo.id}
                  className="bg-muted/40 space-y-3 rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-medium">
                        {fo.fulfillmentNumber}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Warehouse {fo.warehouseId.slice(0, 8)}
                      </p>
                    </div>
                    <StatusBadge status={fo.status.toLowerCase()} />
                  </div>

                  {fo.heldReason ? (
                    <p className="text-destructive text-sm">
                      On hold: {fo.heldReason}
                    </p>
                  ) : null}

                  <ul className="space-y-1 text-sm">
                    {fo.lines.map((line) => (
                      <li
                        key={line.id}
                        className="text-muted-foreground flex justify-between gap-3"
                      >
                        <span>Variant {line.variantId.slice(0, 8)}</span>
                        <span>
                          {line.allocatedQuantity} allocated ·{' '}
                          {line.pickedQuantity} picked · {line.packedQuantity}{' '}
                          packed · {line.dispatchedQuantity} dispatched
                        </span>
                      </li>
                    ))}
                  </ul>

                  {foShipments.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                      {foShipments.map((shipment) => (
                        <li
                          key={shipment.id}
                          className="flex flex-wrap items-center justify-between gap-3 border-t pt-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs">
                              {shipment.shipmentNumber}
                            </span>
                            <StatusBadge
                              status={shipment.status.toLowerCase()}
                            />
                          </div>
                          {!TERMINAL_SHIPMENT_STATUSES.has(shipment.status) &&
                          shipment.status !== 'PENDING_BOOKING' ? (
                            <FulfillmentActionButton
                              action={markShipmentDeliveredAction.bind(
                                null,
                                order.id,
                                shipment.id,
                              )}
                              label="Mark as delivered"
                              pendingLabel="Saving…"
                              variant="outline"
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {next ? (
                    <FulfillmentActionButton
                      action={next.action}
                      label={next.label}
                      pendingLabel={next.pendingLabel}
                      variant="secondary"
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
