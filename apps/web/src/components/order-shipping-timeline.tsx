import {
  CheckCircle2Icon,
  CircleIcon,
  PackageIcon,
  TruckIcon,
  XCircleIcon,
} from 'lucide-react';

import { cn } from 'cn';
import type {
  Order,
  OrderShipment,
  ShipmentStatus,
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

/** Statuses that mean something has gone wrong, not just progressed. */
const ISSUE_STATUSES = new Set<ShipmentStatus>([
  'DELIVERY_FAILED',
  'EXCEPTION',
  'RETURN_TO_SENDER',
  'RETURNED',
  'CANCELLED',
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

/** One shipment's own steps: confirmation lives outside this, per order. */
function stepsForShipment(shipment: OrderShipment): Step[] {
  const events = [...shipment.events].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );

  const steps: Step[] = events.map((event, index) => ({
    key: `${shipment.id}-${index}`,
    label: STATUS_LABELS[event.normalizedStatus] ?? event.normalizedStatus,
    detail: [event.description, event.location].filter(Boolean).join(' · ') || null,
    timestamp: event.occurredAt,
    state: ISSUE_STATUSES.has(event.normalizedStatus)
      ? 'issue'
      : index === events.length - 1 && event.normalizedStatus !== 'DELIVERED'
        ? 'current'
        : 'done',
  }));

  const lastStatus = events.at(-1)?.normalizedStatus ?? shipment.status;
  const isSettled = lastStatus === 'DELIVERED' || ISSUE_STATUSES.has(lastStatus);

  if (shipment.estimatedDeliveryAt && !isSettled) {
    steps.push({
      key: `${shipment.id}-eta`,
      label: 'Estimated delivery',
      detail: shipment.trackingReference
        ? `Tracking ${shipment.trackingReference}`
        : null,
      timestamp: shipment.estimatedDeliveryAt,
      state: 'upcoming',
    });
  }

  return steps;
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
 * delivery — a "Cancelled" order shows just the one step it ever reached.
 */
export function OrderShippingTimeline({
  order,
  shipments,
}: {
  order: Pick<Order, 'status' | 'createdAt'>;
  shipments: OrderShipment[];
}) {
  const confirmed: Step = {
    key: 'confirmed',
    label:
      order.status === 'CANCELLED' ? 'Order cancelled' : 'Order confirmed',
    timestamp: order.createdAt,
    state: order.status === 'CANCELLED' ? 'issue' : 'done',
  };

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

  if (order.status === 'CANCELLED') {
    return <TimelineList steps={[confirmed]} />;
  }

  if (shipments.length === 0) {
    return (
      <TimelineList
        steps={[
          confirmed,
          {
            key: 'preparing',
            label: 'Preparing for shipment',
            state: 'current',
          },
          { key: 'shipped', label: 'Shipped', state: 'upcoming' },
          { key: 'delivered', label: 'Delivered', state: 'upcoming' },
        ]}
      />
    );
  }

  return (
    <div className="space-y-6">
      {shipments.map((shipment, index) => (
        <div key={shipment.id} className="space-y-3">
          {shipments.length > 1 ? (
            <div className="flex items-center gap-2">
              <PackageIcon className="text-muted-foreground size-3.5" />
              <p className="text-muted-foreground text-xs font-medium">
                Shipment {shipment.shipmentNumber} · {shipment.methodName}
              </p>
            </div>
          ) : null}
          <TimelineList
            steps={[
              ...(index === 0 ? [confirmed] : []),
              ...stepsForShipment(shipment),
            ]}
          />
        </div>
      ))}
    </div>
  );
}
