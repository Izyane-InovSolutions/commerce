'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import {
  backendAddTrackingEvent,
  backendBookShipment,
  backendCompletePacking,
  backendCompletePicking,
  backendCreateShipment,
  backendDispatchFulfillment,
  backendGetFulfillment,
  backendRecordPacks,
  backendRecordPicks,
  backendStartPacking,
  backendStartPicking,
} from '@commerce/api-client';

import type { BackendFulfillmentOrder } from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

function revalidateOrder(orderId: string): void {
  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);
}

/**
 * `startWork`/`completeWork` check optimistic concurrency against the work
 * item's own `version`, not the parent fulfillment order's — a fulfillment
 * order can have both a PICK and a PACK work item at once, each moving
 * independently, so there is no single FO-level version that would mean
 * anything here.
 */
function workItemVersion(
  fo: BackendFulfillmentOrder,
  type: 'PICK' | 'PACK',
): number {
  const workItem = fo.workItems.find((item) => item.type === type);
  if (!workItem) {
    throw new Error(`No ${type.toLowerCase()} work item exists yet.`);
  }
  return workItem.version;
}

export async function startPickingAction(
  orderId: string,
  fulfillmentOrderId: string,
): Promise<FormState> {
  try {
    const fo = await backendGetFulfillment(apiClient, fulfillmentOrderId);
    await backendStartPicking(apiClient, fulfillmentOrderId, {
      version: workItemVersion(fo, 'PICK'),
    });
  } catch (error) {
    return toFormState(error);
  }
  revalidateOrder(orderId);
  return { status: 'idle', message: 'Picking started.' };
}

/**
 * Records the full remaining quantity on every line as picked, then
 * completes picking — one click standing in for a real pick list, since this
 * is an admin order view rather than a warehouse scanner app.
 */
export async function completePickingAction(
  orderId: string,
  fulfillmentOrderId: string,
): Promise<FormState> {
  try {
    let fo = await backendGetFulfillment(apiClient, fulfillmentOrderId);
    const lines = fo.lines
      .map((line) => ({
        fulfillmentLineId: line.id,
        quantity:
          line.allocatedQuantity - line.pickedQuantity - line.cancelledQuantity,
      }))
      .filter((line) => line.quantity > 0);

    if (lines.length > 0) {
      fo = await backendRecordPicks(
        apiClient,
        fulfillmentOrderId,
        { lines },
        randomUUID(),
      );
    }

    await backendCompletePicking(apiClient, fulfillmentOrderId, {
      version: workItemVersion(fo, 'PICK'),
    });
  } catch (error) {
    return toFormState(error);
  }
  revalidateOrder(orderId);
  return { status: 'idle', message: 'Picking completed.' };
}

export async function startPackingAction(
  orderId: string,
  fulfillmentOrderId: string,
): Promise<FormState> {
  try {
    const fo = await backendGetFulfillment(apiClient, fulfillmentOrderId);
    await backendStartPacking(apiClient, fulfillmentOrderId, {
      version: workItemVersion(fo, 'PACK'),
    });
  } catch (error) {
    return toFormState(error);
  }
  revalidateOrder(orderId);
  return { status: 'idle', message: 'Packing started.' };
}

/** Same one-click convenience as picking, against picked (not allocated) quantity. */
export async function completePackingAction(
  orderId: string,
  fulfillmentOrderId: string,
): Promise<FormState> {
  try {
    let fo = await backendGetFulfillment(apiClient, fulfillmentOrderId);
    const lines = fo.lines
      .map((line) => ({
        fulfillmentLineId: line.id,
        quantity: line.pickedQuantity - line.packedQuantity - line.cancelledQuantity,
      }))
      .filter((line) => line.quantity > 0);

    if (lines.length > 0) {
      fo = await backendRecordPacks(
        apiClient,
        fulfillmentOrderId,
        { lines },
        randomUUID(),
      );
    }

    await backendCompletePacking(apiClient, fulfillmentOrderId, {
      version: workItemVersion(fo, 'PACK'),
    });
  } catch (error) {
    return toFormState(error);
  }
  revalidateOrder(orderId);
  return { status: 'idle', message: 'Packing completed.' };
}

/**
 * Books a shipment covering every packed-but-unshipped unit, in one step —
 * `ShipmentsService.create` (allocate) immediately followed by `.book`
 * (reserve with the carrier), rather than exposing both as separate admin
 * actions.
 */
export async function shipItAction(
  orderId: string,
  fulfillmentOrderId: string,
): Promise<FormState> {
  try {
    const fo = await backendGetFulfillment(apiClient, fulfillmentOrderId);
    const lines = fo.lines
      .map((line) => ({
        fulfillmentLineId: line.id,
        quantity: line.packedQuantity - line.shipmentAssignedQuantity,
      }))
      .filter((line) => line.quantity > 0);

    if (lines.length === 0) {
      return {
        status: 'error',
        message: 'Nothing packed and ready to ship yet.',
      };
    }

    const shipment = await backendCreateShipment(
      apiClient,
      { fulfillmentOrderId, lines },
      randomUUID(),
    );
    await backendBookShipment(apiClient, shipment.id);
  } catch (error) {
    return toFormState(error);
  }
  revalidateOrder(orderId);
  return { status: 'idle', message: 'Shipment booked.' };
}

export async function dispatchAction(
  orderId: string,
  fulfillmentOrderId: string,
  shipmentId: string,
): Promise<FormState> {
  try {
    await backendDispatchFulfillment(
      apiClient,
      fulfillmentOrderId,
      { shipmentId },
      randomUUID(),
    );
  } catch (error) {
    return toFormState(error);
  }
  revalidateOrder(orderId);
  return { status: 'idle', message: 'Dispatched.' };
}

/**
 * Manual override for when a carrier update never arrives (no webhook or
 * poller wired for every provider yet) — records a `DELIVERED` tracking
 * event by hand rather than waiting on tracking that will never come.
 */
export async function markShipmentDeliveredAction(
  orderId: string,
  shipmentId: string,
): Promise<FormState> {
  try {
    await backendAddTrackingEvent(apiClient, shipmentId, {
      normalizedStatus: 'DELIVERED',
    });
  } catch (error) {
    return toFormState(error);
  }
  revalidateOrder(orderId);
  return { status: 'idle', message: 'Marked as delivered.' };
}
