import { FulfillmentStatus, FulfillmentWorkItemStatus } from '@prisma/client';

import { deriveFulfillmentStatus } from './fulfillment-status';

const PENDING = FulfillmentWorkItemStatus.PENDING;
const IN_PROGRESS = FulfillmentWorkItemStatus.IN_PROGRESS;

function line(overrides: Partial<{
  allocatedQuantity: number;
  pickedQuantity: number;
  packedQuantity: number;
  dispatchedQuantity: number;
  cancelledQuantity: number;
}> = {}): {
  allocatedQuantity: number;
  pickedQuantity: number;
  packedQuantity: number;
  dispatchedQuantity: number;
  cancelledQuantity: number;
} {
  return {
    allocatedQuantity: 10,
    pickedQuantity: 0,
    packedQuantity: 0,
    dispatchedQuantity: 0,
    cancelledQuantity: 0,
    ...overrides,
  };
}

describe('deriveFulfillmentStatus', () => {
  it('is READY_TO_PICK for an untouched fulfillment order', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [line()],
        pickWorkItemStatus: PENDING,
        packWorkItemStatus: PENDING,
        hasOpenException: false,
      }),
    ).toBe(FulfillmentStatus.READY_TO_PICK);
  });

  it('is PICKING once the pick work item starts, before any units are picked', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [line()],
        pickWorkItemStatus: IN_PROGRESS,
        packWorkItemStatus: PENDING,
        hasOpenException: false,
      }),
    ).toBe(FulfillmentStatus.PICKING);
  });

  it('is PARTIALLY_PICKED once some but not all units are picked', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [line({ pickedQuantity: 4 })],
        pickWorkItemStatus: IN_PROGRESS,
        packWorkItemStatus: PENDING,
        hasOpenException: false,
      }),
    ).toBe(FulfillmentStatus.PARTIALLY_PICKED);
  });

  it('is PICKED once every active unit is picked', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [line({ pickedQuantity: 10 })],
        pickWorkItemStatus: IN_PROGRESS,
        packWorkItemStatus: PENDING,
        hasOpenException: false,
      }),
    ).toBe(FulfillmentStatus.PICKED);
  });

  it('is PACKING once the pack work item starts, before any units are packed', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [line({ pickedQuantity: 10 })],
        pickWorkItemStatus: PENDING,
        packWorkItemStatus: IN_PROGRESS,
        hasOpenException: false,
      }),
    ).toBe(FulfillmentStatus.PACKING);
  });

  it('is PARTIALLY_PACKED once some but not all units are packed', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [line({ pickedQuantity: 10, packedQuantity: 6 })],
        pickWorkItemStatus: PENDING,
        packWorkItemStatus: IN_PROGRESS,
        hasOpenException: false,
      }),
    ).toBe(FulfillmentStatus.PARTIALLY_PACKED);
  });

  it('is PACKED once every active unit is packed', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [line({ pickedQuantity: 10, packedQuantity: 10 })],
        pickWorkItemStatus: PENDING,
        packWorkItemStatus: IN_PROGRESS,
        hasOpenException: false,
      }),
    ).toBe(FulfillmentStatus.PACKED);
  });

  it('is PARTIALLY_DISPATCHED once some but not all units are dispatched', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [
          line({ pickedQuantity: 10, packedQuantity: 10, dispatchedQuantity: 4 }),
        ],
        pickWorkItemStatus: PENDING,
        packWorkItemStatus: PENDING,
        hasOpenException: false,
      }),
    ).toBe(FulfillmentStatus.PARTIALLY_DISPATCHED);
  });

  it('is DISPATCHED once every active unit is dispatched', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [
          line({ pickedQuantity: 10, packedQuantity: 10, dispatchedQuantity: 10 }),
        ],
        pickWorkItemStatus: PENDING,
        packWorkItemStatus: PENDING,
        hasOpenException: false,
      }),
    ).toBe(FulfillmentStatus.DISPATCHED);
  });

  it('is CANCELLED once every allocated unit is cancelled', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [line({ cancelledQuantity: 10 })],
        pickWorkItemStatus: PENDING,
        packWorkItemStatus: PENDING,
        hasOpenException: false,
      }),
    ).toBe(FulfillmentStatus.CANCELLED);
  });

  it('is PARTIALLY_CANCELLED when some units are cancelled and nothing else has happened', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [line({ cancelledQuantity: 4 })],
        pickWorkItemStatus: PENDING,
        packWorkItemStatus: PENDING,
        hasOpenException: false,
      }),
    ).toBe(FulfillmentStatus.PARTIALLY_CANCELLED);
  });

  it('is DISPATCHED when the remaining active quantity (after cancellation) is fully dispatched', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [
          line({
            cancelledQuantity: 4,
            pickedQuantity: 6,
            packedQuantity: 6,
            dispatchedQuantity: 6,
          }),
        ],
        pickWorkItemStatus: PENDING,
        packWorkItemStatus: PENDING,
        hasOpenException: false,
      }),
    ).toBe(FulfillmentStatus.DISPATCHED);
  });

  it('is ON_HOLD whenever an exception is open, regardless of progress', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [line({ pickedQuantity: 6 })],
        pickWorkItemStatus: IN_PROGRESS,
        packWorkItemStatus: PENDING,
        hasOpenException: true,
      }),
    ).toBe(FulfillmentStatus.ON_HOLD);
  });

  it('aggregates across multiple lines', () => {
    expect(
      deriveFulfillmentStatus({
        lines: [
          line({ allocatedQuantity: 5, pickedQuantity: 5 }),
          line({ allocatedQuantity: 5, pickedQuantity: 2 }),
        ],
        pickWorkItemStatus: IN_PROGRESS,
        packWorkItemStatus: PENDING,
        hasOpenException: false,
      }),
    ).toBe(FulfillmentStatus.PARTIALLY_PICKED);
  });
});
