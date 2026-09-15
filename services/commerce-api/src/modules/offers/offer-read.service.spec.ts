import { PrismaService } from '../../database/prisma.service';
import { OfferReadService } from './offer-read.service';

describe('OfferReadService', () => {
  const offer = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  };
  const service = new OfferReadService({ offer } as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('deduplicates offer IDs for commerce reads', async () => {
    offer.findMany.mockResolvedValue([]);

    await service.findMany(['offer-1', 'offer-1', 'offer-2']);

    expect(offer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['offer-1', 'offer-2'] } },
      }),
    );
  });

  it('does not query the database for an empty ID collection', async () => {
    await expect(service.findMany([])).resolves.toEqual([]);
    expect(offer.findMany).not.toHaveBeenCalled();
  });

  it('scopes seller inventory reads to seller-stock offers', async () => {
    offer.findMany.mockResolvedValue([]);

    await service.findSellerOffers('seller-1');

    expect(offer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sellerId: 'seller-1', stockSource: 'SELLER' },
      }),
    );
  });
});
