import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { OfferFulfillmentMode } from '@prisma/client';

import type { CartLineView } from '../cart/cart.types';
import {
  SHIPPING_RATE_PROVIDER,
  type ShippingRateProvider,
} from './shipping-rate.provider';

export type ShippingLine = CartLineView & {
  fulfillmentMode: OfferFulfillmentMode;
};

export type ShippingQuoteGroup = {
  fulfillmentMode: OfferFulfillmentMode;
  serviceLevel: string;
  rateCode: string;
  subtotal: number;
  shippingAmount: number;
  total: number;
  currency: string;
  items: ShippingLine[];
};

@Injectable()
export class ShippingService {
  constructor(
    @Inject(SHIPPING_RATE_PROVIDER)
    private readonly rates: ShippingRateProvider,
  ) {}

  async quoteSellerGroups(
    sellerId: string | null,
    items: ShippingLine[],
    destinationCountry: string,
    currency: string,
  ): Promise<ShippingQuoteGroup[]> {
    const groups = new Map<OfferFulfillmentMode, ShippingLine[]>();
    for (const item of items) {
      if (!item.unitPrice || item.unitPrice.currency !== currency)
        throw new BadRequestException(
          'Every shipping group item must use the checkout currency',
        );
      const held = groups.get(item.fulfillmentMode) ?? [];
      held.push(item);
      groups.set(item.fulfillmentMode, held);
    }

    const quotes: ShippingQuoteGroup[] = [];
    for (const [fulfillmentMode, groupItems] of [...groups].sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      const sortedItems = [...groupItems].sort((left, right) =>
        left.offerId.localeCompare(right.offerId),
      );
      const subtotal = sortedItems.reduce(
        (sum, item) => sum + item.lineTotal,
        0,
      );
      const rate = await this.rates.quote({
        sellerId,
        fulfillmentMode,
        destinationCountry,
        currency,
        subtotal,
        quantity: sortedItems.reduce((sum, item) => sum + item.quantity, 0),
      });
      if (!Number.isSafeInteger(rate.amount) || rate.amount < 0)
        throw new BadRequestException(
          'Shipping provider returned an invalid amount',
        );
      quotes.push({
        fulfillmentMode,
        serviceLevel: rate.serviceLevel,
        rateCode: rate.rateCode,
        subtotal,
        shippingAmount: rate.amount,
        total: subtotal + rate.amount,
        currency,
        items: sortedItems,
      });
    }
    return quotes;
  }
}
