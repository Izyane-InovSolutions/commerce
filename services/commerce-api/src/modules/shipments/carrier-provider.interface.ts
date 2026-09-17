import type { ShipmentStatus } from '@prisma/client';

export const CARRIER_PROVIDERS = Symbol('CARRIER_PROVIDERS');

export type CarrierBookingRequest = {
  shipmentId: string;
  shipmentNumber: string;
  carrierCode: string;
  methodCode: string;
  destinationCountry: string;
};

export type CarrierBookingResult = {
  trackingReference: string;
  estimatedDeliveryAt?: Date;
};

export type CarrierTrackingEvent = {
  /** Dedupe key for this event within (shipment, source) — e.g. the
   * carrier's own event id. Omitted for events a source never repeats. */
  providerEventKey?: string;
  rawStatus?: string;
  normalizedStatus: ShipmentStatus;
  description?: string;
  location?: string;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
};

export type ParsedWebhookEvent = CarrierTrackingEvent & {
  /** The carrier's own shipment reference, resolved back to
   * Shipment.trackingReference by ShipmentsService. */
  trackingReference: string;
};

export type ParsedWebhook = {
  /** Used for CarrierWebhookDelivery dedup when the carrier supplies a
   * stable per-delivery id; omit to dedupe by payload hash instead. */
  providerDeliveryId?: string;
  events: ParsedWebhookEvent[];
};

/**
 * One adapter per carrier integration, selected by `providerCode` (the same
 * code a ShippingRateProvider quotes — see shipping-rate.provider.ts). New
 * carriers implement this without touching ShipmentsService.
 */
export interface CarrierProvider {
  readonly providerCode: string;

  book(request: CarrierBookingRequest): Promise<CarrierBookingResult>;

  /** No-op for a carrier where cancelling requires no API call. */
  cancel(trackingReference: string | null): Promise<void>;

  /**
   * Polled periodically for shipments not yet in a terminal status (see
   * ShipmentTrackingPollerService). Returns only new events since the
   * carrier was last asked; an empty array means nothing changed.
   */
  poll(trackingReference: string | null): Promise<CarrierTrackingEvent[]>;

  /** Only implemented by carriers that deliver webhooks — the manual
   * adapter, and any carrier polled instead, omit it. */
  parseWebhook?(
    payload: unknown,
    headers: Record<string, string>,
  ): ParsedWebhook;
}
