import { ProductReferencesService } from '../products/product-references.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { OffersService } from './offers.service';

describe('OffersService', () => {
  let prisma: {
    offer: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    productVariant: { findUnique: jest.Mock };
    price: { create: jest.Mock };
  };
  let service: OffersService;

  beforeEach(() => {
    prisma = {
      offer: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      productVariant: { findUnique: jest.fn() },
      price: { create: jest.fn() },
    };
    service = new OffersService(prisma as unknown as PrismaService, new ProductReferencesService(prisma as unknown as PrismaService));
  });

  describe('create', () => {
    it('does not permit admin retail routes to bypass seller approval', async () => {
      prisma.offer.findUnique.mockResolvedValue({
        id: 'seller-offer',
        sellerId: 'seller-1',
        prices: [],
      });
      await expect(
        service.updateStatus('seller-offer', { status: 'PUBLISHED' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.addPrice('seller-offer', { amount: 100, currency: 'USD' }),
      ).rejects.toThrow(BadRequestException);
      await expect(service.remove('seller-offer')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.offer.update).not.toHaveBeenCalled();
      expect(prisma.price.create).not.toHaveBeenCalled();
      expect(prisma.offer.delete).not.toHaveBeenCalled();
    });
    it('rejects when the variant does not exist', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ variantId: 'missing' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a first-party offer (sellerId null) for an existing variant', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ id: 'v1' });
      prisma.offer.create.mockResolvedValue({ id: 'o1' });
      prisma.offer.findUnique.mockResolvedValue({
        id: 'o1',
        variantId: 'v1',
        sellerId: null,
        prices: [],
      });

      await service.create({ variantId: 'v1' });

      expect(prisma.offer.create).toHaveBeenCalledWith({
        data: { variantId: 'v1', sellerId: null },
      });
    });
  });

  describe('addPrice', () => {
    beforeEach(() => {
      prisma.offer.findUnique.mockResolvedValue({ id: 'o1', prices: [] });
    });

    it('rejects when endsAt is not after startsAt', async () => {
      const startsAt = new Date('2026-02-01T00:00:00Z');
      const endsAt = new Date('2026-01-01T00:00:00Z');

      await expect(
        service.addPrice('o1', {
          amount: 100,
          currency: 'usd',
          startsAt,
          endsAt,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uppercases the currency before storing', async () => {
      await service.addPrice('o1', { amount: 100, currency: 'usd' });

      expect(prisma.price.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currency: 'USD' }) as object,
        }),
      );
    });
  });

  describe('findByIdAdmin', () => {
    it('throws not found for an unknown offer', async () => {
      prisma.offer.findUnique.mockResolvedValue(null);

      await expect(service.findByIdAdmin('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
