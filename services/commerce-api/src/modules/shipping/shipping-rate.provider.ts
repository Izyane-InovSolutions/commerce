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
};

export interface ShippingRateProvider {
  quote(request: ShippingRateRequest): Promise<ShippingRate>;
}
