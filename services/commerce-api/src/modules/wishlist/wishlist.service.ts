import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';

import { pickCurrentPrice } from '../../common/catalog/current-price';
import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { WishlistItemView } from './wishlist.types';

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async list(userId: string): Promise<WishlistItemView[]> {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { offer: { include: { prices: true } } },
    });

    return Promise.all(
      items.map(async (item) => {
        const currentPrice = pickCurrentPrice(item.offer.prices);
        const availableQuantity =
          await this.inventoryService.getAvailableQuantity(
            item.offer.variantId,
          );

        return {
          id: item.id,
          offerId: item.offerId,
          currentPrice: currentPrice
            ? { amount: currentPrice.amount, currency: currentPrice.currency }
            : null,
          isAvailable:
            item.offer.status === ProductStatus.PUBLISHED &&
            !!currentPrice &&
            availableQuantity > 0,
        };
      }),
    );
  }

  async add(userId: string, offerId: string): Promise<void> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
    });

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
