import type { Shipment, ShipmentLine, TrackingEvent } from '@prisma/client';

export type ShipmentWithLines = Shipment & { lines: ShipmentLine[] };

export type ShipmentPage = {
  items: ShipmentWithLines[];
  total: number;
  page: number;
  limit: number;
};

/** No warehouse or staff detail — safe for a customer to read directly. */
export type CustomerShipmentView = {
  id: string;
  shipmentNumber: string;
  status: Shipment['status'];
  methodName: string;
  trackingReference: string | null;
  estimatedDeliveryAt: Date | null;
  events: {
    normalizedStatus: TrackingEvent['normalizedStatus'];
    description: string | null;
    location: string | null;
    occurredAt: Date;
  }[];
};
