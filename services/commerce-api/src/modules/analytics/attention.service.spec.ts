import type { PrismaService } from '../../database/prisma.service';
import { AttentionService } from './attention.service';

type Mock = jest.Mock;

type Counter = { count: Mock };
type PrismaMock = {
  product: Counter;
  seller: Counter;
  returnRequest: Counter;
  sellerPayoutRequest: Counter;
  reviewReport: Counter;
  fulfillmentOrder: Counter;
  sellerOrder: Counter;
  sellerRatingSummary: { findUnique: Mock };
  $queryRaw: Mock;
};

function buildPrisma(): PrismaMock {
  const counter = (value: number): Counter => ({
    count: jest.fn().mockResolvedValue(value),
  });
  return {
    product: counter(2),
    seller: counter(1),
    returnRequest: counter(3),
    sellerPayoutRequest: counter(4),
    reviewReport: counter(5),
    fulfillmentOrder: counter(6),
    sellerOrder: counter(7),
    sellerRatingSummary: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ ratingCount: 3, ratingSum: 13 }),
    },
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ low: 2n, out: 1n }])
      .mockResolvedValueOnce([
        {
          inventoryRecordId: 'r1',
          productId: 'p1',
          productName: 'Phone',
          skuCode: 'P-1',
          warehouseName: 'Main',
          available: 0,
          reorderPoint: 5,
        },
      ]),
  };
}

describe('AttentionService', () => {
  it('collects the admin queues and the stock running out', async () => {
    const prisma = buildPrisma();
    const service = new AttentionService(prisma as unknown as PrismaService);

    await expect(service.forAdmin()).resolves.toEqual({
      pendingSubmissions: 2,
      pendingSellerApplications: 1,
      openReturns: 3,
      pendingPayoutRequests: 4,
      openReviewReports: 5,
      ordersToFulfil: 6,
      fulfilmentOnHold: 6,
      lowStock: 2,
      outOfStock: 1,
      lowStockItems: [
        {
          inventoryRecordId: 'r1',
          productId: 'p1',
          productName: 'Phone',
          skuCode: 'P-1',
          warehouseName: 'Main',
          available: 0,
          reorderPoint: 5,
        },
      ],
    });
  });

  it("scopes a seller's queues and rounds their rating to one decimal", async () => {
    const prisma = buildPrisma();
    const service = new AttentionService(prisma as unknown as PrismaService);

    const result = await service.forSeller('seller-1');

    expect(result).toMatchObject({
      ordersToFulfil: 7,
      openReturns: 3,
      rating: { average: 4.3, count: 3 },
    });
    expect(prisma.sellerOrder.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ sellerId: 'seller-1' }) as object,
    });
    expect(JSON.stringify(prisma.$queryRaw.mock.calls)).toContain('seller-1');
  });
});
