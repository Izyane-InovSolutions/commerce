import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

// A read contract for commerce consumers. Callers do not build Offer/Price
// queries or receive private seller fields. Unavailable offers remain visible
// here so carts and wishlists can explain unavailable lines.
const snapshot = {
  id: true,
  variantId: true,
  sellerId: true,
  status: true,
  stockSource: true,
  fulfillmentMode: true,
  sellerSku: true,
  listingTitle: true,
  prices: true,
  seller: { select: { status: true } },
} satisfies Prisma.OfferSelect;
export type CommerceOffer = Prisma.OfferGetPayload<{ select: typeof snapshot }>;

@Injectable()
export class OfferReadService {
  constructor(private readonly prisma: PrismaService) {}
  find(
    id: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<CommerceOffer | null> {
    return tx.offer.findUnique({ where: { id }, select: snapshot });
  }
  findMany(
    ids: string[],
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<CommerceOffer[]> {
    if (!ids.length) return Promise.resolve([]);
    return tx.offer.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: snapshot,
    });
  }

  findSellerOffers(
    sellerId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<CommerceOffer[]> {
    return tx.offer.findMany({
      where: { sellerId, stockSource: 'SELLER' },
      select: snapshot,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
}
