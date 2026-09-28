import { randomUUID } from 'node:crypto';

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
  BackendAddressSnapshot,
  BackendAdminOrderItem,
  BackendFulfillmentOrder,
  BackendShipment,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { FulfillmentActionButton } from '@/components/fulfillment-action-button';
import {
  CancelLinesForm,
  CancelShipmentForm,
  RaiseExceptionForm,
  ResolveExceptionForm,
  type FulfillmentLineChoice,
} from '@/components/fulfillment-exception-controls';
import { OrderCancelControl } from '@/components/order-cancel-control';
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
import {
  canCancelOrder,
  cancellableQuantity,
  customerName,
  describeOrderItem,
  isFulfillmentClosed,
} from '@/lib/order-operations';
import { requireAdmin } from '@/lib/session';

import {
  completePackingAction,
  completePickingAction,
  dispatchAction,
  cancelShipmentAction,
  markShipmentDeliveredAction,
  shipItAction,
  startPackingAction,
  startPickingAction,
} from '../actions';
import {
  cancelFulfillmentLinesAction,
  cancelOrderAction,
  createFulfillmentExceptionAction,
  resolveFulfillmentExceptionAction,
} from '../operation-actions';

/** The shipments service only cancels one that hasn't been dispatched. */
const CANCELLABLE_SHIPMENT_STATUSES = new Set(['PENDING_BOOKING', 'BOOKED']);

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

const EXCEPTION_TYPE_LABELS: Record<string, string> = {
  SHORT_PICK: 'Short pick',
  DAMAGED: 'Damaged',
  MISSING: 'Missing',
};

/** The address as a list of display lines, skipping the blank parts. */
function addressLines(address: BackendAddressSnapshot): string[] {
  return [
    address.recipientName,
    address.line1,
    address.line2,
    [address.city, address.region, address.postalCode]
      .filter(Boolean)
      .join(', '),
    address.country,
    address.phone,
  ].filter((part): part is string => Boolean(part));
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
): {
  label: string;
  pendingLabel: string;
  action: () => Promise<FormState>;
} | null {
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
        action: completePickingAction.bind(null, orderId, fo.id, randomUUID()),
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
        action: completePackingAction.bind(null, orderId, fo.id, randomUUID()),
      };
    case 'PACKED':
    case 'PARTIALLY_DISPATCHED': {
      const booked = bookedShipment(shipments, fo.id);
      return booked
        ? {
            label: `Dispatch ${booked.shipmentNumber}`,
            pendingLabel: 'Dispatching…',
            action: dispatchAction.bind(
              null,
              orderId,
              fo.id,
              booked.id,
              randomUUID(),
            ),
          }
        : {
            label: 'Ship it',
            pendingLabel: 'Booking…',
            action: shipItAction.bind(null, orderId, fo.id, randomUUID()),
          };
    }
    default:
      return null;
  }
}

export default async function AdminOrderPage({
  params,
}: PageProps<'/orders/[id]'>) {
  const user = await requireAdmin();
  // Resolving exceptions and cancelling fulfillment lines are ADMIN-only at
  // the API; staff see exceptions but not the controls that settle them.
  const isAdminRole = user.role === 'ADMIN';
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
          backendListShipments(apiClient, {
            fulfillmentOrderId: fo.id,
            limit: 20,
          }),
        ),
      );
      shipments = shipmentLists.flatMap((page) => page.items);
    }
  } catch {
    fulfillments = [];
    shipments = [];
  }

  const itemsById = new Map<string, BackendAdminOrderItem>(
    order.items.map((item) => [item.id, item]),
  );
  const lineLabel = (orderItemId: string): string => {
    const { title, detail } = describeOrderItem(itemsById.get(orderItemId));
    return detail ? `${title} (${detail})` : title;
  };
  const address = order.shippingAddress ?? null;

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
        action={
          <div className="flex flex-wrap items-start gap-3">
            <StatusBadge status={order.status.toLowerCase()} />
            {canCancelOrder(order.status) ? (
              <OrderCancelControl
                action={cancelOrderAction.bind(null, order.id)}
              />
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {order.customer ? (
              <>
                <p className="font-medium">{customerName(order.customer)}</p>
                <p>
                  <a
                    href={`mailto:${order.customer.email}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {order.customer.email}
                  </a>
                </p>
                {order.customer.phone ? (
                  <p className="text-muted-foreground">
                    {order.customer.phone}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground font-mono text-xs">
                User {order.userId.slice(0, 8)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ship to</CardTitle>
            <CardDescription>
              The address as it was at checkout — later address-book edits
              don&apos;t change it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {address ? (
              <address className="space-y-0.5 text-sm not-italic">
                {addressLines(address).map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </address>
            ) : (
              <p className="text-muted-foreground text-sm">
                No shipping address on this order.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>
            Product names are the catalog&apos;s current ones; prices are what
            the customer paid.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => {
                  const { title, detail } = describeOrderItem(item);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">
                          {item.product ? (
                            <Link
                              href={`/catalog/${item.product.id}`}
                              className="underline-offset-4 hover:underline"
                            >
                              {title}
                            </Link>
                          ) : (
                            title
                          )}
                        </p>
                        {detail ? (
                          <p className="text-muted-foreground text-xs">
                            {detail}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(item.lineTotal, item.currency)}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
              Payment:{' '}
              <StatusBadge status={order.payment.status.toLowerCase()} />
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
              const closed = isFulfillmentClosed(fo.status);
              const lineChoices: FulfillmentLineChoice[] = fo.lines.map(
                (line) => ({
                  id: line.id,
                  label: lineLabel(line.orderItemId),
                  remaining: cancellableQuantity(line),
                }),
              );
              const cancellableLines = lineChoices.filter(
                (line) => line.remaining > 0,
              );
              const openExceptions = fo.exceptions.filter(
                (exception) => exception.status === 'OPEN',
              );
              const resolvedExceptions = fo.exceptions.filter(
                (exception) => exception.status !== 'OPEN',
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
                        {/* Typed as always set, but a seller-fulfilled
                            order has no platform warehouse. */}
                        {fo.warehouseId
                          ? `Warehouse ${fo.warehouseId.slice(0, 8)}`
                          : 'Seller-fulfilled'}
                      </p>
                    </div>
                    <StatusBadge status={fo.status.toLowerCase()} />
                  </div>

                  {fo.heldReason ? (
                    <p className="text-destructive text-sm">
                      On hold: {fo.heldReason}
                    </p>
                  ) : null}

                  {openExceptions.length > 0 ? (
                    <ul className="space-y-3">
                      {openExceptions.map((exception) => (
                        <li
                          key={exception.id}
                          className="border-destructive/40 bg-destructive/5 space-y-2 rounded-lg border p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="font-medium">
                              {EXCEPTION_TYPE_LABELS[exception.type] ??
                                exception.type}{' '}
                              · {exception.quantity} ×{' '}
                              {lineLabel(
                                fo.lines.find(
                                  (line) =>
                                    line.id === exception.fulfillmentLineId,
                                )?.orderItemId ?? '',
                              )}
                            </span>
                            <StatusBadge status="exception" />
                          </div>
                          <p className="text-muted-foreground text-sm">
                            {exception.reason}
                          </p>
                          {isAdminRole ? (
                            <ResolveExceptionForm
                              idPrefix={exception.id}
                              quantity={exception.quantity}
                              action={resolveFulfillmentExceptionAction.bind(
                                null,
                                order.id,
                                fo.id,
                                exception.id,
                              )}
                            />
                          ) : (
                            <p className="text-muted-foreground text-xs">
                              An administrator needs to resolve this before the
                              shipment can continue.
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <ul className="space-y-1 text-sm">
                    {fo.lines.map((line) => (
                      <li
                        key={line.id}
                        className="text-muted-foreground flex flex-wrap justify-between gap-x-3"
                      >
                        <span className="text-foreground">
                          {lineLabel(line.orderItemId)}
                        </span>
                        <span>
                          {line.allocatedQuantity} allocated ·{' '}
                          {line.pickedQuantity} picked · {line.packedQuantity}{' '}
                          packed · {line.dispatchedQuantity} dispatched
                          {line.cancelledQuantity > 0
                            ? ` · ${line.cancelledQuantity} cancelled`
                            : ''}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {resolvedExceptions.length > 0 ? (
                    <p className="text-muted-foreground text-xs">
                      {resolvedExceptions.length} resolved{' '}
                      {resolvedExceptions.length === 1
                        ? 'exception'
                        : 'exceptions'}{' '}
                      — see the fulfillment history for detail.
                    </p>
                  ) : null}

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
                          {CANCELLABLE_SHIPMENT_STATUSES.has(
                            shipment.status,
                          ) ? (
                            <CancelShipmentForm
                              idPrefix={shipment.id}
                              shipmentNumber={shipment.shipmentNumber}
                              action={cancelShipmentAction.bind(
                                null,
                                order.id,
                                shipment.id,
                              )}
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

                  {!closed ? (
                    <div className="flex flex-wrap items-start gap-2 border-t pt-3">
                      <RaiseExceptionForm
                        idPrefix={fo.id}
                        lines={lineChoices}
                        action={createFulfillmentExceptionAction.bind(
                          null,
                          order.id,
                          fo.id,
                        )}
                      />
                      {/* The API only cancels against a platform warehouse —
                          seller-fulfilled stock is cancelled by the seller. */}
                      {isAdminRole &&
                      fo.warehouseId &&
                      cancellableLines.length > 0 ? (
                        <CancelLinesForm
                          idPrefix={fo.id}
                          lines={cancellableLines}
                          action={cancelFulfillmentLinesAction.bind(
                            null,
                            order.id,
                            fo.id,
                            randomUUID(),
                          )}
                        />
                      ) : null}
                    </div>
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
