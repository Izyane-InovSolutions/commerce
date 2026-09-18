import { NotFoundException } from '@nestjs/common';
import {
  FulfillmentStatus,
  OfferFulfillmentMode,
  ReturnStatus,
  ShipmentStatus,
} from '@prisma/client';

import { SellerOrdersService } from './seller-orders.service';

function buildPrisma(): {
  sellerOrder: {
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
  };
  returnItem: { findMany: jest.Mock };
  $transaction: jest.Mock;
} {
  const prisma = {
    sellerOrder: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    returnItem: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

function buildSellersService(sellerId = 'seller-1'): {
  requireApproved: jest.Mock;
} {
  return {
    requireApproved: jest.fn().mockResolvedValue({ id: sellerId }),
  };
}

describe('SellerOrdersService', () => {
  describe('findOwn', () => {
    it('404s when the seller order belongs to a different seller', async () => {
      const prisma = buildPrisma();
      const sellers = buildSellersService('seller-1');
      prisma.sellerOrder.findUnique.mockResolvedValue({
        id: 'so-1',
        sellerId: 'seller-2',
      });
      const service = new SellerOrdersService(prisma as never, sellers as never);

      await expect(service.findOwn('user-1', 'so-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s when no seller order exists at all', async () => {
      const prisma = buildPrisma();
      const sellers = buildSellersService();
      prisma.sellerOrder.findUnique.mockResolvedValue(null);
      const service = new SellerOrdersService(prisma as never, sellers as never);

      await expect(service.findOwn('user-1', 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    const snapshot = {
      label: null,
      recipientName: 'Jane Doe',
      phone: null,
      line1: '1 Main St',
      line2: null,
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      country: 'US',
    };

    function baseSellerOrder(
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> {
      return {
        id: 'so-1',
        sellerId: 'seller-1',
        status: 'PAID',
        subtotal: 1000,
        shippingAmount: 100,
        total: 1100,
        refundedAmount: 0,
        currency: 'USD',
        items: [],
        order: { shippingAddress: snapshot },
        shippingGroups: [],
        ...overrides,
      };
    }

    it('reveals the full destination once the seller has accepted their own SELLER-mode fulfillment order', async () => {
      const prisma = buildPrisma();
      const sellers = buildSellersService();
      prisma.sellerOrder.findUnique.mockResolvedValue(
        baseSellerOrder({
          shippingGroups: [
            {
              id: 'sg-1',
              fulfillmentMode: OfferFulfillmentMode.SELLER,
              serviceLevel: 'standard',
              methodName: 'Manual',
              items: [],
              fulfillmentOrders: [
                {
                  id: 'fo-1',
                  fulfillmentNumber: 'FO-1',
                  status: FulfillmentStatus.PACKING,
                  acceptedAt: new Date('2026-01-01'),
                  heldReason: null,
                  lines: [],
                  events: [],
                },
              ],
              shipments: [],
            },
          ],
        }),
      );
      const service = new SellerOrdersService(prisma as never, sellers as never);

      const detail = await service.findOwn('user-1', 'so-1');

      expect(detail.shippingGroups[0]!.destination).toEqual(snapshot);
      expect(detail.shippingGroups[0]!.fulfillmentOrders[0]!.id).toBe('fo-1');
    });

    it('redacts the destination for a SELLER-mode group before acceptance', async () => {
      const prisma = buildPrisma();
      const sellers = buildSellersService();
      prisma.sellerOrder.findUnique.mockResolvedValue(
        baseSellerOrder({
          shippingGroups: [
            {
              id: 'sg-1',
              fulfillmentMode: OfferFulfillmentMode.SELLER,
              serviceLevel: 'standard',
              methodName: 'Manual',
              items: [],
              fulfillmentOrders: [
                {
                  id: 'fo-1',
                  fulfillmentNumber: 'FO-1',
                  status: FulfillmentStatus.AWAITING_ACCEPTANCE,
                  acceptedAt: null,
                  heldReason: null,
                  lines: [],
                  events: [],
                },
              ],
              shipments: [],
            },
          ],
        }),
      );
      const service = new SellerOrdersService(prisma as never, sellers as never);

      const detail = await service.findOwn('user-1', 'so-1');

      expect(detail.shippingGroups[0]!.destination).toEqual({
        city: 'Springfield',
        region: 'IL',
        country: 'US',
      });
    });

    it('never reveals more than the coarse destination for a PLATFORM-mode group, even when "accepted"', async () => {
      const prisma = buildPrisma();
      const sellers = buildSellersService();
      prisma.sellerOrder.findUnique.mockResolvedValue(
        baseSellerOrder({
          shippingGroups: [
            {
              id: 'sg-1',
              fulfillmentMode: OfferFulfillmentMode.PLATFORM,
              serviceLevel: 'standard',
              methodName: 'Manual',
              items: [],
              fulfillmentOrders: [
                {
                  id: 'fo-platform-1',
                  fulfillmentNumber: 'FO-2',
                  status: FulfillmentStatus.PACKED,
                  acceptedAt: new Date('2026-01-01'),
                  heldReason: null,
                  lines: [],
                  events: [],
                },
              ],
              shipments: [],
            },
          ],
        }),
      );
      const service = new SellerOrdersService(prisma as never, sellers as never);

      const detail = await service.findOwn('user-1', 'so-1');

      expect(detail.shippingGroups[0]!.destination).toEqual({
        city: 'Springfield',
        region: 'IL',
        country: 'US',
      });
      // Defense in depth: no actionable id surfaced for a platform group.
      expect(detail.shippingGroups[0]!.fulfillmentOrders[0]!.id).toBeNull();
    });

    it('projects only this seller order\'s own return items', async () => {
      const prisma = buildPrisma();
      const sellers = buildSellersService();
      prisma.sellerOrder.findUnique.mockResolvedValue(baseSellerOrder());
      prisma.returnItem.findMany.mockResolvedValue([
        {
          id: 'ri-1',
          quantity: 2,
          reasonCode: 'DAMAGED',
          createdAt: new Date('2026-01-01'),
          returnRequest: { id: 'rr-1', status: ReturnStatus.RECEIVED },
          orderItem: { id: 'oi-1' },
          receiptLines: [{ quantity: 1 }],
          inspectionLines: [{ acceptedQuantity: 1, rejectedQuantity: 0 }],
          refundCaseItems: [],
        },
      ]);
      const service = new SellerOrdersService(prisma as never, sellers as never);

      const detail = await service.findOwn('user-1', 'so-1');

      expect(prisma.returnItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderItem: { sellerOrderId: 'so-1' } },
        }),
      );
      expect(detail.returns).toHaveLength(1);
      expect(detail.returns[0]!.receivedQuantity).toBe(1);
      expect(detail.returns[0]!.acceptedQuantity).toBe(1);
    });
  });

  describe('listOwn', () => {
    it('scopes the list to the calling seller and summarizes shipments/returns', async () => {
      const prisma = buildPrisma();
      const sellers = buildSellersService('seller-1');
      prisma.sellerOrder.findMany.mockResolvedValue([
        {
          id: 'so-1',
          sellerId: 'seller-1',
          status: 'PAID',
          subtotal: 100,
          shippingAmount: 10,
          total: 110,
          refundedAmount: 0,
          currency: 'USD',
          items: [],
          fulfillmentOrders: [
            {
              id: 'fo-1',
              shippingGroupId: 'sg-1',
              status: FulfillmentStatus.AWAITING_ACCEPTANCE,
              acceptedAt: null,
              shippingGroup: { fulfillmentMode: OfferFulfillmentMode.SELLER },
            },
          ],
          shipments: [{ status: ShipmentStatus.BOOKED }, { status: ShipmentStatus.BOOKED }],
        },
      ]);
      prisma.sellerOrder.count.mockResolvedValue(1);
      prisma.returnItem.findMany.mockResolvedValue([
        {
          orderItem: { sellerOrderId: 'so-1' },
          returnRequest: { status: ReturnStatus.REQUESTED },
        },
      ]);
      const service = new SellerOrdersService(prisma as never, sellers as never);

      const page = await service.listOwn('user-1', { page: 1, limit: 20 } as never);

      expect(prisma.sellerOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sellerId: 'seller-1' } }),
      );
      expect(page.items[0]!.fulfillmentOrders[0]).toEqual({
        id: 'fo-1',
        shippingGroupId: 'sg-1',
        fulfillmentMode: OfferFulfillmentMode.SELLER,
        status: FulfillmentStatus.AWAITING_ACCEPTANCE,
        awaitingAcceptance: true,
        acceptedAt: null,
      });
      expect(page.items[0]!.shipments).toEqual({
        count: 2,
        statuses: { [ShipmentStatus.BOOKED]: 2 },
      });
      expect(page.items[0]!.returns).toEqual({
        total: 1,
        byStatus: { [ReturnStatus.REQUESTED]: 1 },
      });
    });

    it('applies the fulfillmentStatus/fulfillmentMode/date filters to the where clause', async () => {
      const prisma = buildPrisma();
      const sellers = buildSellersService('seller-1');
      prisma.sellerOrder.findMany.mockResolvedValue([]);
      prisma.sellerOrder.count.mockResolvedValue(0);
      const service = new SellerOrdersService(prisma as never, sellers as never);

      await service.listOwn('user-1', {
        page: 1,
        limit: 20,
        fulfillmentStatus: FulfillmentStatus.AWAITING_ACCEPTANCE,
        fulfillmentMode: OfferFulfillmentMode.SELLER,
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
      } as never);

      expect(prisma.sellerOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sellerId: 'seller-1',
            fulfillmentOrders: {
              some: { status: FulfillmentStatus.AWAITING_ACCEPTANCE },
            },
            shippingGroups: {
              some: { fulfillmentMode: OfferFulfillmentMode.SELLER },
            },
            createdAt: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-02-01'),
            },
          },
        }),
      );
    });
  });
});
