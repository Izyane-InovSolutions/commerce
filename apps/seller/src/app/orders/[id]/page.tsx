import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ApiError, backendGetSellerOrder, backendListSellerOffers } from '@commerce/api-client';
import type { BackendSellerOrderDetail } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { DispatchFulfillmentForm } from '@/components/dispatch-fulfillment-form';
import { FulfillmentActionButton } from '@/components/fulfillment-action-button';
import { PageHeader } from '@/components/page-header';
import { ReasonActionForm } from '@/components/reason-action-form';
import { SellerGateNotice } from '@/components/seller-gate-notice';
import { StatusBadge } from '@/components/status-badge';
import { TrackShipmentForm } from '@/components/track-shipment-form';
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
import { formatMinor } from '@/lib/money';
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

import {
  acceptFulfillmentAction,
  cancelFulfillmentAction,
  dispatchFulfillmentAction,
  packFulfillmentAction,
  rejectFulfillmentAction,
  trackShipmentAction,
} from '../actions';

type ShippingGroup = BackendSellerOrderDetail['shippingGroups'][number];
type FulfillmentDetail = ShippingGroup['fulfillmentOrders'][number];
type ShipmentDetail = ShippingGroup['shipments'][number];

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

function statusLabel(status: string): string {
  return status.toLowerCase().replace(/_/g, ' ');
}

/** A full address once accepted; city/region/country only before that or for
 * a platform-fulfilled group — see destination-summary.ts on the API. */
function DestinationSummary({
  destination,
}: {
  destination: ShippingGroup['destination'];
}) {
  if ('line1' in destination) {
    return (
      <p className="text-muted-foreground text-sm text-pretty">
        {destination.recipientName} · {destination.line1}
        {destination.line2 ? `, ${destination.line2}` : ''}, {destination.city}
        {destination.region ? `, ${destination.region}` : ''}, {destination.country}
        {destination.postalCode ? ` ${destination.postalCode}` : ''}
        {destination.phone ? ` · ${destination.phone}` : ''}
      </p>
    );
  }

  return (
    <p className="text-muted-foreground text-sm">
      {destination.city}
      {destination.region ? `, ${destination.region}` : ''}, {destination.country}
      {' — full address revealed once accepted.'}
    </p>
  );
}

function ShipmentRow({
  orderId,
  shipment,
}: {
  orderId: string;
  shipment: ShipmentDetail;
}) {
  const canTrack = !TERMINAL_SHIPMENT_STATUSES.has(shipment.status);

  return (
    <li className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{shipment.shipmentNumber}</span>
          <StatusBadge status={statusLabel(shipment.status)} />
        </div>
        <span className="text-muted-foreground text-xs">
          {shipment.carrierCode}
          {shipment.trackingReference ? ` · ${shipment.trackingReference}` : ''}
        </span>
      </div>

      {shipment.trackingEvents.length > 0 ? (
        <ul className="text-muted-foreground space-y-0.5 text-xs">
          {shipment.trackingEvents.map((event, index) => (
            <li key={index}>
              {formatDate(event.occurredAt)} — {statusLabel(event.normalizedStatus)}
              {event.location ? ` (${event.location})` : ''}
              {event.description ? `: ${event.description}` : ''}
            </li>
          ))}
        </ul>
      ) : null}

      {canTrack ? (
        <TrackShipmentForm
          action={trackShipmentAction.bind(null, orderId, shipment.id)}
        />
      ) : null}
    </li>
  );
}

/**
 * A seller-managed fulfillment order: the full set of steps admins run for a
 * platform warehouse, run by the seller instead — accept or decline the job,
 * pack it, dispatch it, then report real-world carrier progress.
 */
function SellerFulfillmentCard({
  orderId,
  fo,
}: {
  orderId: string;
  fo: FulfillmentDetail;
}) {
  if (fo.id === null) return null;
  const fulfillmentOrderId = fo.id;

  const packable = fo.lines.some(
    (line) => line.allocatedQuantity - line.cancelledQuantity - line.packedQuantity > 0,
  );
  const cancellable = fo.lines.some(
    (line) =>
      line.allocatedQuantity - line.cancelledQuantity - line.shipmentAssignedQuantity > 0,
  );
  const dispatchable = fo.lines.some(
    (line) => line.packedQuantity - line.dispatchedQuantity > 0,
  );

  return (
    <div className="bg-muted/40 space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-sm font-medium">{fo.fulfillmentNumber}</p>
        <StatusBadge status={statusLabel(fo.status)} />
      </div>

      {fo.heldReason ? (
        <p className="text-destructive text-sm">On hold: {fo.heldReason}</p>
      ) : null}

      <ul className="space-y-1 text-sm">
        {fo.lines.map((line) => (
          <li key={line.id} className="text-muted-foreground flex justify-between gap-3">
            <span>Variant {line.variantId.slice(0, 8)}</span>
            <span>
              {line.allocatedQuantity} allocated · {line.packedQuantity} packed ·{' '}
              {line.dispatchedQuantity} dispatched
              {line.cancelledQuantity > 0 ? ` · ${line.cancelledQuantity} cancelled` : ''}
            </span>
          </li>
        ))}
      </ul>

      {fo.awaitingAcceptance ? (
        <div className="flex flex-wrap items-start gap-3">
          <FulfillmentActionButton
            action={acceptFulfillmentAction.bind(null, orderId, fulfillmentOrderId)}
            label="Accept"
            pendingLabel="Accepting…"
          />
          <div className="min-w-48">
            <ReasonActionForm
              action={rejectFulfillmentAction.bind(null, orderId, fulfillmentOrderId)}
              submitLabel="Decline"
              placeholder="Why you can't fulfil this"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            {packable ? (
              <FulfillmentActionButton
                action={packFulfillmentAction.bind(null, orderId, fulfillmentOrderId)}
                label="Pack"
                pendingLabel="Packing…"
              />
            ) : null}
            {cancellable ? (
              <div className="min-w-48">
                <ReasonActionForm
                  action={cancelFulfillmentAction.bind(null, orderId, fulfillmentOrderId)}
                  submitLabel="Cancel remaining"
                  placeholder="Why you're cancelling"
                />
              </div>
            ) : null}
          </div>
          {dispatchable ? (
            <DispatchFulfillmentForm
              action={dispatchFulfillmentAction.bind(null, orderId, fulfillmentOrderId)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

export default async function SellerOrderPage({
  params,
}: PageProps<'/orders/[id]'>) {
  await requireUser();
  const account = await getSellerAccount();
  const { id } = await params;

  if (account.state !== 'approved') {
    return (
      <SellerGateNotice
        title={`Order ${id.slice(0, 8)}`}
        description="Orders placed against your listings."
        account={account}
      />
    );
  }

  let order: BackendSellerOrderDetail;
  try {
    order = await backendGetSellerOrder(apiClient, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Order" description="Items and shipping." />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  let titles = new Map<string, string>();
  try {
    const offers = await backendListSellerOffers(apiClient, { limit: 100 });
    titles = new Map(
      offers.items.map((offer) => [
        offer.id,
        offer.listingTitle ?? offer.sellerSku ?? 'Listing',
      ]),
    );
  } catch {
    titles = new Map();
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
        action={<StatusBadge status={statusLabel(order.status)} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Your items</CardTitle>
          <CardDescription>Only the lines sold against your listings.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {titles.get(item.offerId) ?? (
                        <span className="font-mono text-xs">{item.offerId.slice(0, 8)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMinor(item.lineTotal, item.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipping</CardTitle>
          <CardDescription>
            One card per shipping group. A group you ship yourself can be worked
            through here; one the platform fulfils just shows its status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {order.shippingGroups.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing to fulfil yet — normal before payment is confirmed.
            </p>
          ) : (
            order.shippingGroups.map((group) => {
              const selfManaged = group.fulfillmentMode === 'SELLER';

              return (
                <div key={group.id} className="space-y-3 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      {group.methodName}
                      <span className="text-muted-foreground font-normal">
                        {' '}
                        · {selfManaged ? 'shipped by you' : 'shipped by the platform'}
                      </span>
                    </p>
                  </div>

                  <DestinationSummary destination={group.destination} />

                  {selfManaged ? (
                    group.fulfillmentOrders.map((fo) => (
                      <SellerFulfillmentCard key={fo.fulfillmentNumber} orderId={order.id} fo={fo} />
                    ))
                  ) : (
                    <div className="space-y-2">
                      {group.fulfillmentOrders.map((fo) => (
                        <div
                          key={fo.fulfillmentNumber}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="font-mono text-xs">{fo.fulfillmentNumber}</span>
                          <StatusBadge status={statusLabel(fo.status)} />
                        </div>
                      ))}
                    </div>
                  )}

                  {group.shipments.length > 0 ? (
                    <ul className="space-y-2">
                      {group.shipments.map((shipment) =>
                        selfManaged ? (
                          <ShipmentRow key={shipment.id} orderId={order.id} shipment={shipment} />
                        ) : (
                          <li key={shipment.id} className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
                            <span className="font-mono text-xs">{shipment.shipmentNumber}</span>
                            <StatusBadge status={statusLabel(shipment.status)} />
                          </li>
                        ),
                      )}
                    </ul>
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
