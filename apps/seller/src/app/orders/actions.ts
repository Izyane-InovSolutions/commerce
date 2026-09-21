'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import {
  backendAcceptSellerFulfillment,
  backendCancelSellerFulfillment,
  backendDispatchSellerFulfillment,
  backendGetSellerOrder,
  backendPackSellerFulfillment,
  backendRejectSellerFulfillment,
  backendTrackSellerShipment,
} from '@commerce/api-client';
import type {
  BackendSellerOrderDetail,
  BackendSellerTrackingInput,
} from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';

type SellerFulfillmentDetail =
  BackendSellerOrderDetail['shippingGroups'][number]['fulfillmentOrders'][number];

function revalidateOrder(orderId: string): void {
  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);
}

/**
 * Re-reads the fulfillment order fresh, right before acting on it — same
 * reason apps/admin's own actions re-fetch before computing a quantity: a
 * hidden field on a page the seller has had open a while could be stale, and
 * every quantity below is computed from whatever's true right now.
 */
async function currentFulfillment(
  orderId: string,
  fulfillmentOrderId: string,
): Promise<SellerFulfillmentDetail> {
  const order = await backendGetSellerOrder(apiClient, orderId);
  for (const group of order.shippingGroups) {
    const fo = group.fulfillmentOrders.find(
      (candidate) => candidate.id === fulfillmentOrderId,
    );
    if (fo) return fo;
  }
  throw new Error('Fulfillment order not found on this order.');
}

/** Accepts the job as it stands — declining it is `rejectFulfillmentAction`
 * instead, while there's still nothing shipped to unwind. */
export async function acceptFulfillmentAction(
  orderId: string,
  fulfillmentOrderId: string,
): Promise<FormState> {
  try {
    const fo = await currentFulfillment(orderId, fulfillmentOrderId);
    await backendAcceptSellerFulfillment(apiClient, fulfillmentOrderId, fo.version);
  } catch (error) {
    return toFormState(error);
  }

  revalidateOrder(orderId);
  return { status: 'idle', message: 'Accepted.' };
}

export async function rejectFulfillmentAction(
  orderId: string,
  fulfillmentOrderId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason === '') {
    return {
      status: 'error',
      fieldErrors: { reason: ['Say why you can’t fulfil this.'] },
    };
  }

  try {
    const fo = await currentFulfillment(orderId, fulfillmentOrderId);
    await backendRejectSellerFulfillment(
      apiClient,
      fulfillmentOrderId,
      { version: fo.version, reason },
      randomUUID(),
    );
  } catch (error) {
    return toFormState(error);
  }

  revalidateOrder(orderId);
  return { status: 'idle', message: 'Rejected — the customer will be refunded.' };
}

/** Packs everything still allocated and not already packed or cancelled —
 * one click standing in for a real pack list, same convention as apps/admin's
 * own completePackingAction. */
export async function packFulfillmentAction(
  orderId: string,
  fulfillmentOrderId: string,
): Promise<FormState> {
  try {
    const fo = await currentFulfillment(orderId, fulfillmentOrderId);
    const lines = fo.lines
      .map((line) => ({
        fulfillmentLineId: line.id,
        quantity:
          line.allocatedQuantity - line.cancelledQuantity - line.packedQuantity,
      }))
      .filter((line) => line.quantity > 0);

    if (lines.length === 0) {
      return { status: 'error', message: 'Nothing left to pack.' };
    }

    await backendPackSellerFulfillment(
      apiClient,
      fulfillmentOrderId,
      { lines },
      randomUUID(),
    );
  } catch (error) {
    return toFormState(error);
  }

  revalidateOrder(orderId);
  return { status: 'idle', message: 'Packed.' };
}

/** Cancels whatever quantity hasn't already been claimed by a shipment —
 * the rest of the line, not a choice of how much. */
export async function cancelFulfillmentAction(
  orderId: string,
  fulfillmentOrderId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason === '') {
    return {
      status: 'error',
      fieldErrors: { reason: ['Say why you’re cancelling.'] },
    };
  }

  try {
    const fo = await currentFulfillment(orderId, fulfillmentOrderId);
    const lines = fo.lines
      .map((line) => ({
        fulfillmentLineId: line.id,
        quantity:
          line.allocatedQuantity -
          line.cancelledQuantity -
          line.shipmentAssignedQuantity,
      }))
      .filter((line) => line.quantity > 0);

    if (lines.length === 0) {
      return { status: 'error', message: 'Nothing left to cancel.' };
    }

    await backendCancelSellerFulfillment(
      apiClient,
      fulfillmentOrderId,
      { lines, reason },
      randomUUID(),
    );
  } catch (error) {
    return toFormState(error);
  }

  revalidateOrder(orderId);
  return { status: 'idle', message: 'Cancelled — the customer will be refunded.' };
}

/**
 * Dispatches everything packed and not yet dispatched, in one shipment.
 * There's no carrier integration for a seller's own shipment (no booking
 * step either) — this just records who's carrying it and marks it gone.
 */
export async function dispatchFulfillmentAction(
  orderId: string,
  fulfillmentOrderId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const carrierCode = String(formData.get('carrierCode') ?? '').trim();
  if (carrierCode === '') {
    return {
      status: 'error',
      fieldErrors: { carrierCode: ['Enter who’s carrying this.'] },
    };
  }
  const trackingReference =
    String(formData.get('trackingReference') ?? '').trim() || undefined;
  const estimatedDeliveryAtRaw = String(
    formData.get('estimatedDeliveryAt') ?? '',
  ).trim();
  const estimatedDeliveryAt = estimatedDeliveryAtRaw
    ? new Date(estimatedDeliveryAtRaw).toISOString()
    : undefined;

  try {
    const fo = await currentFulfillment(orderId, fulfillmentOrderId);
    const lines = fo.lines
      .map((line) => ({
        fulfillmentLineId: line.id,
        quantity: line.packedQuantity - line.dispatchedQuantity,
      }))
      .filter((line) => line.quantity > 0);

    if (lines.length === 0) {
      return {
        status: 'error',
        message: 'Nothing packed and ready to dispatch yet.',
      };
    }

    await backendDispatchSellerFulfillment(
      apiClient,
      fulfillmentOrderId,
      { lines, carrierCode, trackingReference, estimatedDeliveryAt },
      randomUUID(),
    );
  } catch (error) {
    return toFormState(error);
  }

  revalidateOrder(orderId);
  return { status: 'idle', message: 'Dispatched.' };
}

const SELLER_POSTABLE_STATUSES = new Set<BackendSellerTrackingInput['normalizedStatus']>([
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'EXCEPTION',
  'RETURN_TO_SENDER',
  'RETURNED',
]);

/** Reports real-world carrier progress against an already-dispatched
 * shipment — booking/dispatch states stay the API's own to set. */
export async function trackShipmentAction(
  orderId: string,
  shipmentId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const rawStatus = String(formData.get('normalizedStatus') ?? '');
  if (
    !SELLER_POSTABLE_STATUSES.has(
      rawStatus as BackendSellerTrackingInput['normalizedStatus'],
    )
  ) {
    return {
      status: 'error',
      fieldErrors: { normalizedStatus: ['Choose a status.'] },
    };
  }
  const normalizedStatus = rawStatus as BackendSellerTrackingInput['normalizedStatus'];
  const description = String(formData.get('description') ?? '').trim() || undefined;
  const location = String(formData.get('location') ?? '').trim() || undefined;

  try {
    await backendTrackSellerShipment(
      apiClient,
      shipmentId,
      {
        normalizedStatus,
        description,
        location,
        occurredAt: new Date().toISOString(),
      },
      randomUUID(),
    );
  } catch (error) {
    return toFormState(error);
  }

  revalidateOrder(orderId);
  return { status: 'idle', message: 'Tracking updated.' };
}
