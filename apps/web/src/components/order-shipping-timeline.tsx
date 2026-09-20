import { CheckCircle2Icon, CircleIcon, TruckIcon, XCircleIcon } from 'lucide-react';

import { cn } from 'cn';
import type {
  FulfillmentSummary,
  Order,
  OrderShipment,
  ShipmentStatus,
  ShipmentTrackingEvent,
} from '@/lib/commerce-types';

/** A human label for every status a shipment's tracking events can carry. */
const STATUS_LABELS: Record<ShipmentStatus, string> = {
  PENDING_BOOKING: 'Preparing shipment',
  BOOKED: 'Booked with carrier',
  DISPATCHED: 'Dispatched',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  DELIVERY_FAILED: 'Delivery attempt failed',
  EXCEPTION: 'Delivery exception',
  RETURN_TO_SENDER: 'Returning to sender',
  RETURNED: 'Returned to sender',
  CANCELLED: 'Shipment cancelled',
};

/** Once a shipment (or its events) reaches one of these, "Shipped" is done —
 * booking with a carrier doesn't count yet, only actually going out. */
const DISPATCHED_OR_LATER = new Set<ShipmentStatus>([
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'EXCEPTION',
  'RETURN_TO_SENDER',
  'RETURNED',
]);

/** Statuses that mean something has gone wrong, not just progressed. */
const ISSUE_STATUSES = new Set<ShipmentStatus>([
  'DELIVERY_FAILED',
  'EXCEPTION',
  'RETURN_TO_SENDER',
  'RETURNED',
  'CANCELLED',
]);

/** Fulfillment summaries that mean every fulfillment order has at least
 * finished packing — packing is done ahead of any shipment existing. */
const PACKED_OR_LATER = new Set<FulfillmentSummary>([
  'PACKED',
  'PARTIALLY_DISPATCHED',
  'DISPATCHED',
]);

type StepState = 'done' | 'current' | 'upcoming' | 'issue';

type Step = {
  key: string;
  label: string;
  detail?: string | null;
  timestamp?: string | null;
  state: StepState;
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function iconFor(state: StepState) {
  switch (state) {
    case 'done':
      return CheckCircle2Icon;
    case 'issue':
      return XCircleIcon;
    case 'current':
      return TruckIcon;
    default:
      return CircleIcon;
  }
}

function eventDetail(event: ShipmentTrackingEvent): string | null {
  return [event.description, event.location].filter(Boolean).join(' · ') || null;
}

/** Every tracking event across every shipment on the order, oldest first —
 * an order with split fulfillment still reads as one timeline. */
function allEvents(shipments: OrderShipment[]): ShipmentTrackingEvent[] {
  return shipments
    .flatMap((shipment) => shipment.events)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}

function TimelineList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, index) => {
        const Icon = iconFor(step.state);
        const isLast = index === steps.length - 1;

        return (
          <li key={step.key} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast ? (
              <span
                aria-hidden
                className={cn(
                  'absolute top-5 left-[calc(0.5rem-0.5px)] h-full w-px',
                  step.state === 'done' ? 'bg-primary/40' : 'bg-border',
                )}
              />
            ) : null}
            <Icon
              className={cn(
                'relative mt-0.5 size-4 shrink-0',
                step.state === 'done' && 'text-primary',
                step.state === 'current' && 'text-primary',
                step.state === 'issue' && 'text-destructive',
                step.state === 'upcoming' && 'text-muted-foreground/50',
              )}
            />
            <div className="min-w-0 flex-1 pb-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p
                  className={cn(
                    'text-sm font-medium',
                    step.state === 'upcoming' && 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </p>
                {step.timestamp ? (
                  <p className="text-muted-foreground text-xs">
                    {step.state === 'upcoming' ? 'Est. ' : ''}
                    {formatTimestamp(step.timestamp)}
                  </p>
                ) : null}
              </div>
              {step.detail ? (
                <p className="text-muted-foreground mt-0.5 text-xs text-pretty">
                  {step.detail}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The shipping timeline for one order, from confirmation through to
 * delivery. Always shows the same four milestones — Confirmed, Preparing,
 * Shipped, Delivered — ticking each one off as it's reached, rather than
 * replacing them with a raw event dump once a shipment exists (which used to
 * make the later, still-pending milestones disappear entirely).
 */
export function OrderShippingTimeline({
  order,
  shipments,
}: {
  order: Pick<Order, 'status' | 'createdAt' | 'fulfillmentSummary' | 'packedAt'>;
  shipments: OrderShipment[];
}) {
  if (order.status === 'PENDING_PAYMENT') {
    return (
      <TimelineList
        steps={[
          {
            key: 'awaiting-payment',
            label: 'Awaiting payment',
            state: 'current',
          },
        ]}
      />
    );
  }

  const confirmed: Step = {
    key: 'confirmed',
    label:
      order.status === 'CANCELLED' ? 'Order cancelled' : 'Order confirmed',
    timestamp: order.createdAt,
    state: order.status === 'CANCELLED' ? 'issue' : 'done',
  };

  if (order.status === 'CANCELLED') {
    return <TimelineList steps={[confirmed]} />;
  }

  const packed =
    shipments.length > 0 ||
    (order.fulfillmentSummary != null &&
      PACKED_OR_LATER.has(order.fulfillmentSummary));

  // The exact moment packing finished, when known — falling back to the
  // first shipment's own createdAt (packing must have already finished for
  // it to exist) rather than leaving a done step with no time on it.
  const packedAt =
    order.packedAt ??
    shipments
      .map((shipment) => shipment.createdAt)
      .sort((a, b) => Date.parse(a) - Date.parse(b))
      .at(0) ??
    null;

  const preparing: Step = {
    key: 'preparing',
    label: 'Preparing for shipment',
    timestamp: packed ? packedAt : null,
    state: packed ? 'done' : 'current',
  };

  const events = allEvents(shipments);
  const dispatchEvent = events.find((event) =>
    DISPATCHED_OR_LATER.has(event.normalizedStatus),
  );
  const shipped =
    dispatchEvent !== undefined ||
    order.fulfillmentSummary === 'DISPATCHED' ||
    order.fulfillmentSummary === 'PARTIALLY_DISPATCHED' ||
    shipments.some((shipment) => DISPATCHED_OR_LATER.has(shipment.status));

  const shippedStep: Step = shipped
    ? {
        key: 'shipped',
        label: dispatchEvent
          ? (STATUS_LABELS[dispatchEvent.normalizedStatus] ?? 'Shipped')
          : 'Shipped',
        detail: dispatchEvent ? eventDetail(dispatchEvent) : null,
        timestamp: dispatchEvent?.occurredAt ?? null,
        state: 'done',
      }
    : { key: 'shipped', label: 'Shipped', state: packed ? 'current' : 'upcoming' };

  const deliveredEvent = [...events]
    .reverse()
    .find((event) => event.normalizedStatus === 'DELIVERED');
  const delivered =
    shipments.length > 0 &&
    shipments.every(
      (shipment) =>
        shipment.status === 'DELIVERED' ||
        shipment.events.some((event) => event.normalizedStatus === 'DELIVERED'),
    );

  const issueEvent = [...events]
    .reverse()
    .find((event) => ISSUE_STATUSES.has(event.normalizedStatus));

  let deliveredStep: Step;
  if (delivered) {
    deliveredStep = {
      key: 'delivered',
      label: 'Delivered',
      timestamp: deliveredEvent?.occurredAt ?? null,
      state: 'done',
    };
  } else if (issueEvent) {
    deliveredStep = {
      key: 'delivered',
      label: STATUS_LABELS[issueEvent.normalizedStatus] ?? 'Delivery issue',
      detail: eventDetail(issueEvent),
      timestamp: issueEvent.occurredAt,
      state: 'issue',
    };
  } else {
    const eta = shipments
      .map((shipment) => shipment.estimatedDeliveryAt)
      .find((value): value is string => value != null);
    deliveredStep = {
      key: 'delivered',
      label: 'Delivered',
      timestamp: eta ?? null,
      state: shipped ? 'current' : 'upcoming',
    };
  }

  return (
    <TimelineList steps={[confirmed, preparing, shippedStep, deliveredStep]} />
  );
}
