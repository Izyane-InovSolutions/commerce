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
  /**
   * Carrier identity a shipment booked against this quote (#29) must book
   * through. providerCode selects the CarrierProvider from its registry;
   * methodCode is the provider's own rate/method identifier (may equal
   * rateCode); methodName is shown to the customer.
   */
  providerCode: string;
  carrierCode: string;
  methodCode: string;
  methodName: string;
};

export interface ShippingRateProvider {
  quote(request: ShippingRateRequest): Promise<ShippingRate>;
}
