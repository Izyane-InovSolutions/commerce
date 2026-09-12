import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';

import { pickCurrentPrice } from '../../common/catalog/current-price';
import { OfferReadService } from '../offers/offer-read.service';
import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { WishlistItemView } from './wishlist.types';

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly offers: OfferReadService,
  ) {}

  async list(userId: string, currency: string): Promise<WishlistItemView[]> {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const offers = await this.offers.findMany(
      items.map((item) => item.offerId),
    );
    const byId = new Map(offers.map((offer) => [offer.id, offer]));
    const quantities = await this.inventoryService.getAvailableQuantities(
      offers.filter((offer) => !offer.sellerId).map((offer) => offer.variantId),
    );
    return items.map((item) => {
      const offer = byId.get(item.offerId);
      const currentPrice = pickCurrentPrice(offer?.prices ?? [], currency);
      return {
        id: item.id,
        offerId: item.offerId,
        currentPrice: currentPrice
          ? { amount: currentPrice.amount, currency: currentPrice.currency }
          : null,
        isAvailable:
          !!offer &&
          !offer.sellerId &&
          offer.status === ProductStatus.PUBLISHED &&
          !!currentPrice &&
          (quantities.get(offer.variantId) ?? 0) > 0,
      };
    });
  }

  async add(userId: string, offerId: string): Promise<void> {
    const offer = await this.offers.find(offerId);

    if (!offer) {
      throw new BadRequestException('This offer does not exist');
    }

    try {
      await this.prisma.wishlistItem.create({ data: { userId, offerId } });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      // Already on the wishlist — adding again is a no-op, not an error.
    }
  }

  async remove(userId: string, offerId: string): Promise<void> {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, offerId } });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
