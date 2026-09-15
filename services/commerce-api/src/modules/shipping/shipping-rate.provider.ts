import type { OfferFulfillmentMode } from '@prisma/client';

export const SHIPPING_RATE_PROVIDER = Symbol('SHIPPING_RATE_PROVIDER');

export type ShippingRateRequest = {
  sellerId: string | null;
  fulfillmentMode: OfferFulfillmentMode;
  destinationCountry: string;
  currency: string;
  subtotal: number;
  quantity: number;
};

export type ShippingRate = {
  serviceLevel: string;
  rateCode: string;
  amount: number;
  /** Identifies the specific quote for reconciliation if the rate policy changes later. */
  quoteId: string;
  /** Business days, inclusive, counted from the day the order ships. */
  estimatedDeliveryDays: { min: number; max: number };
  expiresAt: Date;
};

export interface ShippingRateProvider {
  quote(request: ShippingRateRequest): Promise<ShippingRate>;
}
