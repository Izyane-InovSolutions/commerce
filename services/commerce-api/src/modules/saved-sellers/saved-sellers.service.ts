import { BadRequestException, Injectable } from '@nestjs/common';
import { SellerStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { averageRatingFromSummary } from '../reviews/rating-summary.util';
import { SavedSellerView } from './saved-sellers.types';

@Injectable()
export class SavedSellersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<SavedSellerView[]> {
    const saved = await this.prisma.savedSeller.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        seller: {
          select: {
            storefrontSlug: true,
            displayName: true,
            description: true,
            status: true,
            ratingSummary: true,
          },
        },
      },
    });

    return saved.map((item) => ({
      id: item.id,
      sellerId: item.sellerId,
      storefrontSlug: item.seller.storefrontSlug,
      displayName: item.seller.displayName,
      description: item.seller.description,
      averageRating: averageRatingFromSummary(item.seller.ratingSummary),
      ratingCount: item.seller.ratingSummary?.ratingCount ?? 0,
      isAvailable:
        item.seller.status === SellerStatus.APPROVED &&
        !!item.seller.storefrontSlug,
    }));
  }

  async add(userId: string, sellerId: string): Promise<void> {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
    });

    if (!seller) {
      throw new BadRequestException('This seller does not exist');
    }

    try {
      await this.prisma.savedSeller.create({ data: { userId, sellerId } });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      // Already saved — saving again is a no-op, not an error.
    }
  }

  async remove(userId: string, sellerId: string): Promise<void> {
    await this.prisma.savedSeller.deleteMany({ where: { userId, sellerId } });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
