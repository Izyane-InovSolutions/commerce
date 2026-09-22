import { ProductReferencesService } from '../products/product-references.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MediaService } from '../media/media.service';
import { SellersService } from '../sellers/sellers.service';
import { StorefrontsService } from '../sellers/storefronts.service';
import { MarketplaceOffersService } from './marketplace-offers.service';

describe('MarketplaceOffersService mutation guards', () => {
  const prisma = {
    $transaction: jest.fn(),
    offer: { findFirst: jest.fn(), updateMany: jest.fn() },
    price: { updateMany: jest.fn(), create: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const sellers = { lockApproved: jest.fn() };
  const service = new MarketplaceOffersService(
    prisma as unknown as PrismaService,
    sellers as unknown as SellersService,
    {} as StorefrontsService,
    new ProductReferencesService(prisma as unknown as PrismaService),
    {} as MediaService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    sellers.lockApproved.mockResolvedValue({ id: 'seller' });
    prisma.offer.findFirst.mockResolvedValue({
      id: 'offer',
      sellerId: 'seller',
      status: 'DRAFT',
      version: 1,
      prices: [],
    });
    prisma.offer.updateMany.mockResolvedValue({ count: 1 });
  });
  it('rejects a suspended seller before changing an offer', async () => {
    sellers.lockApproved.mockRejectedValue(new ForbiddenException());
    await expect(
      service.price('user', 'offer', {
        version: 1,
        amount: 100,
        currency: 'USD',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.offer.findFirst).not.toHaveBeenCalled();
  });
  it('scopes offer lookup to the authenticated seller', async () => {
    prisma.offer.findFirst.mockResolvedValue(null);
    await expect(
      service.price('user', 'other-offer', {
        version: 1,
        amount: 100,
        currency: 'USD',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.offer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'other-offer', sellerId: 'seller' },
      }),
    );
  });
  it('rejects a stale version without retiring prices', async () => {
    prisma.offer.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.price('user', 'offer', {
        version: 0,
        amount: 100,
        currency: 'USD',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.price.updateMany).not.toHaveBeenCalled();
    expect(prisma.price.create).not.toHaveBeenCalled();
  });
  it('rejects a currency change on an existing offer', async () => {
    prisma.offer.findFirst.mockResolvedValue({
      id: 'offer',
      sellerId: 'seller',
      status: 'DRAFT',
      prices: [{ currency: 'ZMW' }],
    });
    await expect(
      service.price('user', 'offer', {
        version: 1,
        amount: 100,
        currency: 'USD',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.offer.updateMany).not.toHaveBeenCalled();
  });
  it('requires a completed storefront before publication', async () => {
    await expect(
      service.status('user', 'offer', { version: 1, status: 'PUBLISHED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.offer.updateMany).not.toHaveBeenCalled();
  });
});
