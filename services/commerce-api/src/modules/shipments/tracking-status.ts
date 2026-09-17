import { ShipmentStatus } from '@prisma/client';

const TERMINAL_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.DELIVERED,
  ShipmentStatus.DELIVERY_FAILED,
  ShipmentStatus.RETURN_TO_SENDER,
  ShipmentStatus.RETURNED,
  ShipmentStatus.CANCELLED,
];

export type ProjectStatusInput = {
  currentStatus: ShipmentStatus;
  /** occurredAt of whichever tracking event most recently set currentStatus,
   * or null if the shipment has no tracking events yet. */
  latestEventOccurredAt: Date | null;
  newEvent: {
    normalizedStatus: ShipmentStatus;
    occurredAt: Date;
    isCorrection: boolean;
  };
};

/**
 * Projects the shipment's status forward from a new tracking event.
 * Corrections always win — an admin fixing a wrong terminal status is
 * exactly what they're for. Otherwise: a terminal status never regresses
 * (see the Shipment model comment), and an event that arrived out of order
 * (an older `occurredAt` than what's already been projected) is recorded as
 * history but never rewinds the projection.
 */
export function projectShipmentStatus(input: ProjectStatusInput): ShipmentStatus {
  const { currentStatus, latestEventOccurredAt, newEvent } = input;

  if (newEvent.isCorrection) return newEvent.normalizedStatus;
  if (TERMINAL_STATUSES.includes(currentStatus)) return currentStatus;
  if (latestEventOccurredAt && newEvent.occurredAt < latestEventOccurredAt) {
    return currentStatus;
  }
  return newEvent.normalizedStatus;
}

export function isTerminalShipmentStatus(status: ShipmentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
