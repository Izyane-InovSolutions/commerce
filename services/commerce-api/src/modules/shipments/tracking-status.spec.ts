import { ShipmentStatus } from '@prisma/client';

import { isTerminalShipmentStatus, projectShipmentStatus } from './tracking-status';

const T0 = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2026-01-02T00:00:00Z');
const T2 = new Date('2026-01-03T00:00:00Z');

describe('projectShipmentStatus', () => {
  it('advances to the new event status when nothing is terminal or out of order', () => {
    expect(
      projectShipmentStatus({
        currentStatus: ShipmentStatus.BOOKED,
        latestEventOccurredAt: T0,
        newEvent: { normalizedStatus: ShipmentStatus.IN_TRANSIT, occurredAt: T1, isCorrection: false },
      }),
    ).toBe(ShipmentStatus.IN_TRANSIT);
  });

  it('never regresses a terminal status from a normal event', () => {
    expect(
      projectShipmentStatus({
        currentStatus: ShipmentStatus.DELIVERED,
        latestEventOccurredAt: T2,
        newEvent: { normalizedStatus: ShipmentStatus.IN_TRANSIT, occurredAt: T1, isCorrection: false },
      }),
    ).toBe(ShipmentStatus.DELIVERED);
  });

  it('ignores an out-of-order event older than the latest projected one', () => {
    expect(
      projectShipmentStatus({
        currentStatus: ShipmentStatus.IN_TRANSIT,
        latestEventOccurredAt: T2,
        newEvent: { normalizedStatus: ShipmentStatus.OUT_FOR_DELIVERY, occurredAt: T1, isCorrection: false },
      }),
    ).toBe(ShipmentStatus.IN_TRANSIT);
  });

  it('lets a correction override a terminal status', () => {
    expect(
      projectShipmentStatus({
        currentStatus: ShipmentStatus.DELIVERED,
        latestEventOccurredAt: T2,
        newEvent: { normalizedStatus: ShipmentStatus.RETURN_TO_SENDER, occurredAt: T0, isCorrection: true },
      }),
    ).toBe(ShipmentStatus.RETURN_TO_SENDER);
  });

  it('accepts the first event on a shipment with no tracking history yet', () => {
    expect(
      projectShipmentStatus({
        currentStatus: ShipmentStatus.BOOKED,
        latestEventOccurredAt: null,
        newEvent: { normalizedStatus: ShipmentStatus.DISPATCHED, occurredAt: T0, isCorrection: false },
      }),
    ).toBe(ShipmentStatus.DISPATCHED);
  });
});

describe('isTerminalShipmentStatus', () => {
  it.each([
    ShipmentStatus.DELIVERED,
    ShipmentStatus.DELIVERY_FAILED,
    ShipmentStatus.RETURN_TO_SENDER,
    ShipmentStatus.RETURNED,
    ShipmentStatus.CANCELLED,
  ])('%s is terminal', (status) => {
    expect(isTerminalShipmentStatus(status)).toBe(true);
  });

  it.each([
    ShipmentStatus.PENDING_BOOKING,
    ShipmentStatus.BOOKED,
    ShipmentStatus.DISPATCHED,
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.EXCEPTION,
  ])('%s is not terminal', (status) => {
    expect(isTerminalShipmentStatus(status)).toBe(false);
  });
});
