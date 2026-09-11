import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SellerStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SellersService } from './sellers.service';
import { UpdateStorefrontDto } from './dto/update-storefront.dto';

export type PublicStorefront = {
  id: string;
  storefrontSlug: string | null;
  displayName: string | null;
  description: string | null;
};
export const PUBLIC_STOREFRONT_SELECT = {
  id: true,
  storefrontSlug: true,
  displayName: true,
  description: true,
} as const;

@Injectable()
export class StorefrontsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellers: SellersService,
  ) {}

  async findPublic(slug: string): Promise<PublicStorefront> {
    const storefront = await this.prisma.seller.findFirst({
      where: {
        storefrontSlug: slug,
        status: SellerStatus.APPROVED,
        ownerUser: { isActive: true },
      },
      select: PUBLIC_STOREFRONT_SELECT,
    });
    if (!storefront) throw new NotFoundException('Storefront not found');
    return storefront;
  }

  async update(
    userId: string,
    dto: UpdateStorefrontDto,
  ): Promise<PublicStorefront & { version: number }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const seller = await this.sellers.lockApproved(userId, tx);
        const { version, ...profile } = dto;
        const updated = await tx.seller.updateMany({
          where: { id: seller.id, version },
          data: {
            ...profile,
            displayName: profile.displayName.trim(),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1)
          throw new ConflictException(
            'Storefront changed; reload and try again',
          );
        await tx.auditEvent.create({
          data: {
            actorUserId: userId,
            action: 'seller.storefront_updated',
            targetType: 'Seller',
            targetId: seller.id,
          },
        });
        return tx.seller.findUniqueOrThrow({
          where: { id: seller.id },
          select: { ...PUBLIC_STOREFRONT_SELECT, version: true },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Storefront slug is already taken');
      throw error;
    }
  }
}
