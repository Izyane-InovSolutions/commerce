import { OrderStatus } from '@prisma/client';

import { type AdminOrderRow, toAdminOrderDetail } from './admin-order-detail';

function row(): AdminOrderRow {
  const createdAt = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'order-1',
    userId: 'user-1',
    status: OrderStatus.PAID,
    currency: 'USD',
    subtotal: 2000,
    shippingAmount: 0,
    total: 2000,
    shippingAddress: { line1: '1 Main St' },
    idempotencyKey: null,
    createdAt,
    updatedAt: createdAt,
    sellerOrders: [],
    payment: null,
    user: {
      id: 'user-1',
      email: 'buyer@example.com',
      firstName: 'Ada',
      lastName: null,
      phone: null,
    },
    items: [
      {
        id: 'item-1',
        orderId: 'order-1',
        sellerOrderId: 'seller-order-1',
        shippingGroupId: 'group-1',
        offerId: 'offer-1',
        quantity: 2,
        unitAmount: 1000,
        currency: 'USD',
        lineTotal: 2000,
        reservationId: null,
        createdAt,
        offer: {
          sellerSku: 'SELLER-1',
          listingTitle: null,
          variant: {
            id: 'variant-1',
            skuCode: 'SKU-1',
            name: 'Blue / Large',
            product: {
              id: 'product-1',
              name: 'Rain jacket',
              slug: 'rain-jacket',
            },
          },
        },
      },
    ],
  };
}

describe('toAdminOrderDetail', () => {
  it('exposes the user as `customer` and drops the raw `user` key', () => {
    const detail = toAdminOrderDetail(row());

    expect(detail.customer).toEqual({
      id: 'user-1',
      email: 'buyer@example.com',
      firstName: 'Ada',
      lastName: null,
      phone: null,
    });
    expect(detail).not.toHaveProperty('user');
  });

  it('flattens each item offer into product and variant siblings', () => {
    const [item] = toAdminOrderDetail(row()).items;

    expect(item).toMatchObject({
      id: 'item-1',
      offerId: 'offer-1',
      quantity: 2,
      product: { id: 'product-1', name: 'Rain jacket', slug: 'rain-jacket' },
      variant: { id: 'variant-1', skuCode: 'SKU-1', name: 'Blue / Large' },
      sellerSku: 'SELLER-1',
      listingTitle: null,
    });
    expect(item).not.toHaveProperty('offer');
  });

  it('keeps the order columns untouched', () => {
    const detail = toAdminOrderDetail(row());

    expect(detail).toMatchObject({
      id: 'order-1',
      status: OrderStatus.PAID,
      total: 2000,
      shippingAddress: { line1: '1 Main St' },
      sellerOrders: [],
      payment: null,
    });
  });
});
