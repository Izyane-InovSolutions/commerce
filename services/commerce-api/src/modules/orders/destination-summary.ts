import { OfferFulfillmentMode } from '@prisma/client';

import type { AddressSnapshot } from '../../common/addresses/address-snapshot';

/** The coarse view: enough for a seller to plan logistics, not enough to
 * ship to the customer directly without accepting the fulfillment order. */
export type CoarseDestination = Pick<
  AddressSnapshot,
  'city' | 'region' | 'country'
>;

export type SellerDestinationView = CoarseDestination | AddressSnapshot;

function toCoarse(snapshot: AddressSnapshot): CoarseDestination {
  return {
    city: snapshot.city,
    region: snapshot.region,
    country: snapshot.country,
  };
}

/**
 * A seller sees the full delivery address only for their own SELLER-mode
 * fulfillment order, and only once they have accepted it (acceptedAt set).
 * PLATFORM-mode groups are read-only for the seller, so they never get more
 * than the coarse summary regardless of any acceptance state on that group.
 */
export function projectDestination(
  snapshot: AddressSnapshot,
  fulfillmentMode: OfferFulfillmentMode,
  acceptedAt: Date | null,
): SellerDestinationView {
  if (fulfillmentMode === OfferFulfillmentMode.SELLER && acceptedAt) {
    return snapshot;
  }
  return toCoarse(snapshot);
}
