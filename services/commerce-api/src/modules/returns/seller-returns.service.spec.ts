import { RefundCaseSource, RefundCaseStatus, ReturnStatus } from '@prisma/client';

import { SellerReturnsService } from './seller-returns.service';

function buildPrisma(): {
  returnItem: { findMany: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
} {
  const prisma = {
    returnItem: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

function buildSellersService(sellerId = 'seller-1'): { requireApproved: jest.Mock } {
  return { requireApproved: jest.fn().mockResolvedValue({ id: sellerId }) };
}

describe('SellerReturnsService.listOwn', () => {
  it('scopes the query to only this seller\'s own ReturnItem rows, even within a multi-seller ReturnRequest', async () => {
    const prisma = buildPrisma();
    const sellers = buildSellersService('seller-1');
    // A ReturnRequest can span sellers (#30); the service must never return
    // rows belonging to another seller's OrderItem even if they share a
    // ReturnRequest. The where clause is what enforces this at the DB
    // level - assert it filters through orderItem.sellerOrder.sellerId.
    prisma.returnItem.findMany.mockResolvedValue([
      {
        id: 'ri-1',
        quantity: 3,
        reasonCode: 'DAMAGED',
        createdAt: new Date('2026-01-01'),
        returnRequest: { id: 'rr-shared', status: ReturnStatus.REQUESTED },
        orderItem: { id: 'oi-1' },
        receiptLines: [],
        inspectionLines: [],
        refundCaseItems: [
          {
            refundCase: {
              id: 'rc-1',
              status: RefundCaseStatus.PENDING,
              amount: 500,
              currency: 'USD',
              source: RefundCaseSource.RETURN,
            },
          },
        ],
      },
    ]);
    prisma.returnItem.count.mockResolvedValue(1);
    const service = new SellerReturnsService(prisma as never, sellers as never);

    const page = await service.listOwn('user-1', { page: 1, limit: 20 } as never);

    expect(prisma.returnItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderItem: { sellerOrder: { sellerId: 'seller-1' } },
        }) as object,
      }),
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toEqual({
      returnItemId: 'ri-1',
      returnRequestId: 'rr-shared',
      orderItemId: 'oi-1',
      status: ReturnStatus.REQUESTED,
      reasonCode: 'DAMAGED',
      requestedQuantity: 3,
      receivedQuantity: 0,
      acceptedQuantity: 0,
      rejectedQuantity: 0,
      refunds: [
        { refundCaseId: 'rc-1', status: RefundCaseStatus.PENDING, amount: 500, currency: 'USD' },
      ],
      createdAt: new Date('2026-01-01'),
    });
  });

  it('applies the status and date range filters', async () => {
    const prisma = buildPrisma();
    const sellers = buildSellersService('seller-1');
    prisma.returnItem.findMany.mockResolvedValue([]);
    prisma.returnItem.count.mockResolvedValue(0);
    const service = new SellerReturnsService(prisma as never, sellers as never);

    await service.listOwn('user-1', {
      page: 1,
      limit: 20,
      status: ReturnStatus.REFUNDED,
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
    } as never);

    expect(prisma.returnItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orderItem: { sellerOrder: { sellerId: 'seller-1' } },
          returnRequest: { status: ReturnStatus.REFUNDED },
          createdAt: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-02-01'),
          },
        },
      }),
    );
  });
});
