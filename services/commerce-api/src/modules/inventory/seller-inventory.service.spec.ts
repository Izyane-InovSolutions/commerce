import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { OfferReadService } from '../offers/offer-read.service';
import { SellersService } from '../sellers/sellers.service';
import { InventoryService } from './inventory.service';
import { SellerInventoryService } from './seller-inventory.service';

describe('SellerInventoryService', () => {
  const prisma = {
    $transaction: jest.fn(),
    inventoryRecord: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  const inventory = {
    setOfferQuantity: jest.fn(),
    listMovements: jest.fn(),
  };
  const sellers = { mine: jest.fn(), lockApproved: jest.fn() };
  const offers = {
    find: jest.fn(),
    findMany: jest.fn(),
    findSellerOffers: jest.fn(),
  };
  const service = new SellerInventoryService(
    prisma as unknown as PrismaService,
    inventory as unknown as InventoryService,
    sellers as unknown as SellersService,
    offers as unknown as OfferReadService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    sellers.mine.mockResolvedValue({ id: 'seller-1' });
    sellers.lockApproved.mockResolvedValue({ id: 'seller-1' });
  });

  it('lists every seller-stock offer and supplies zeroes before first update', async () => {
    offers.findSellerOffers.mockResolvedValue([
      {
        id: 'offer-1',
        variantId: 'variant-1',
        sellerSku: 'SKU-1',
        listingTitle: 'Listing',
      },
    ]);
    prisma.inventoryRecord.findMany.mockResolvedValue([]);

    await expect(service.list('user-1')).resolves.toEqual([
      expect.objectContaining({
        offerId: 'offer-1',
        sellerSku: 'SKU-1',
        onHand: 0,
        reserved: 0,
        available: 0,
        version: 0,
      }),
    ]);
  });

  it('rejects an inventory update for another seller offer', async () => {
    offers.findMany.mockResolvedValue([
      {
        id: 'offer-1',
        sellerId: 'seller-2',
        stockSource: 'SELLER',
      },
    ]);

    await expect(
      service.set('user-1', 'offer-1', { quantity: 5, version: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(inventory.setOfferQuantity).not.toHaveBeenCalled();
  });

  it('rejects duplicate offer IDs before starting a bulk transaction', async () => {
    await expect(
      service.updateMany('user-1', [
        { offerId: 'offer-1', quantity: 1, version: 0 },
        { offerId: 'offer-1', quantity: 2, version: 0 },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('applies a bulk update in one transaction and stable lock order', async () => {
    offers.findMany.mockResolvedValue([
      {
        id: 'offer-b',
        sellerId: 'seller-1',
        variantId: 'variant-b',
        stockSource: 'SELLER',
        sellerSku: 'B',
        listingTitle: 'B',
      },
      {
        id: 'offer-a',
        sellerId: 'seller-1',
        variantId: 'variant-a',
        stockSource: 'SELLER',
        sellerSku: 'A',
        listingTitle: 'A',
      },
    ]);
    inventory.setOfferQuantity.mockImplementation(
      (offerId: string, variantId: string, quantity: number) =>
        Promise.resolve({
          id: `record-${offerId}`,
          offerId,
          variantId,
          onHand: quantity,
          reserved: 0,
          version: 1,
          updatedAt: new Date(),
        }),
    );

    const result = await service.updateMany('user-1', [
      { offerId: 'offer-b', quantity: 2, version: 0 },
      { offerId: 'offer-a', quantity: 1, version: 0 },
    ]);

    expect(result.map((item) => item.offerId)).toEqual(['offer-a', 'offer-b']);
    expect(inventory.setOfferQuantity).toHaveBeenNthCalledWith(
      1,
      'offer-a',
      'variant-a',
      1,
      0,
      'user-1',
      undefined,
      prisma,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
