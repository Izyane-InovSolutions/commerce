import type { OrderItem, Prisma } from '@prisma/client';

import type { OrderWithItems } from './orders.service';

/**
 * What the admin order read needs to name each line: the product and variant
 * behind the offer, plus the seller's own SKU/title for it. Order items don't
 * snapshot any of this, so these are the catalog's current names — a later
 * rename shows here, which is what staff searching the catalog expect.
 */
export const ADMIN_ORDER_ITEM_OFFER_SELECT = {
  select: {
    sellerSku: true,
    listingTitle: true,
    variant: {
      select: {
        id: true,
        skuCode: true,
        name: true,
        product: { select: { id: true, name: true, slug: true } },
      },
    },
  },
} as const;

/** Who placed the order — contact detail only, never credentials or role. */
export const ADMIN_ORDER_CUSTOMER_SELECT = {
  select: {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    phone: true,
  },
} as const;

type OfferSummaryRow = Prisma.OfferGetPayload<
  typeof ADMIN_ORDER_ITEM_OFFER_SELECT
>;
export type AdminOrderCustomer = Prisma.UserGetPayload<
  typeof ADMIN_ORDER_CUSTOMER_SELECT
>;

/** The row `findAny` reads: one query, with the offer and user joined in. */
export type AdminOrderRow = Omit<OrderWithItems, 'items'> & {
  items: (OrderItem & { offer: OfferSummaryRow })[];
  user: AdminOrderCustomer;
};

export type AdminOrderItem = OrderItem & {
  product: { id: string; name: string; slug: string };
  variant: { id: string; skuCode: string; name: string | null };
  sellerSku: string | null;
  listingTitle: string | null;
};

/**
 * Still an `OrderWithItems` (every item keeps its own columns), so callers
 * typed against that — the cancellation service returns this read — are
 * unaffected by the extra fields.
 */
export type AdminOrderDetail = Omit<OrderWithItems, 'items'> & {
  items: AdminOrderItem[];
  customer: AdminOrderCustomer;
};

/**
 * Flattens the joined rows into the response shape: `user` becomes
 * `customer`, and each item's nested `offer.variant.product` chain becomes
 * `product`/`variant` siblings, so the API doesn't leak Prisma's relation
 * nesting as its contract.
 */
export function toAdminOrderDetail(row: AdminOrderRow): AdminOrderDetail {
  const { user, items, ...order } = row;
  return {
    ...order,
    customer: user,
    items: items.map(({ offer, ...item }) => ({
      ...item,
      product: offer.variant.product,
      variant: {
        id: offer.variant.id,
        skuCode: offer.variant.skuCode,
        name: offer.variant.name,
      },
      sellerSku: offer.sellerSku,
      listingTitle: offer.listingTitle,
    })),
  };
}
