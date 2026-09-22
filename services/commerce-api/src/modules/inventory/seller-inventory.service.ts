import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OfferStockSource, type InventoryMovement } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { OfferReadService } from '../offers/offer-read.service';
import { SellersService } from '../sellers/sellers.service';
import type {
  BulkSellerInventoryItemDto,
  SetSellerInventoryDto,
} from './dto/seller-inventory.dto';
import { InventoryService } from './inventory.service';
import type { SellerInventoryView } from './inventory.types';

@Injectable()
export class SellerInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly sellers: SellersService,
    private readonly offers: OfferReadService,
  ) {}

  async list(userId: string): Promise<SellerInventoryView[]> {
    const seller = await this.sellers.mine(userId);
    const offers = await this.offers.findSellerOffers(seller.id);
    const records = await this.prisma.inventoryRecord.findMany({
      where: { offerId: { in: offers.map((offer) => offer.id) } },
    });
    const byOffer = new Map(records.map((record) => [record.offerId, record]));
    return offers.map((offer) => {
      const record = byOffer.get(offer.id);
      return {
        id: record?.id ?? null,
        offerId: offer.id,
        variantId: offer.variantId,
        sellerSku: offer.sellerSku,
        listingTitle: offer.listingTitle,
        onHand: record?.onHand ?? 0,
        reserved: record?.reserved ?? 0,
        available: record ? record.onHand - record.reserved : 0,
        version: record?.version ?? 0,
        updatedAt: record?.updatedAt ?? null,
      };
    });
  }

  set(
    userId: string,
    offerId: string,
    dto: SetSellerInventoryDto,
  ): Promise<SellerInventoryView> {
    return this.updateMany(userId, [{ offerId, ...dto }]).then(
      (items) => items[0]!,
    );
  }

  async updateMany(
    userId: string,
    items: BulkSellerInventoryItemDto[],
  ): Promise<SellerInventoryView[]> {
    const ids = items.map((item) => item.offerId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Each offer may appear only once');

    return this.prisma.$transaction(async (tx) => {
      const seller = await this.sellers.lockApproved(userId, tx);
      const offers = await this.offers.findMany(ids, tx);
      const byId = new Map(offers.map((offer) => [offer.id, offer]));
      for (const id of ids) {
        const offer = byId.get(id);
        if (!offer || offer.sellerId !== seller.id)
          throw new NotFoundException('Offer not found');
        if (offer.stockSource !== OfferStockSource.SELLER)
          throw new BadRequestException(
            'Inventory for this offer is managed by the platform',
          );
      }

      const updated: SellerInventoryView[] = [];
      for (const item of [...items].sort((a, b) =>
        a.offerId.localeCompare(b.offerId),
      )) {
        const offer = byId.get(item.offerId)!;
        const record = await this.inventory.setOfferQuantity(
          offer.id,
          offer.variantId,
          item.quantity,
          item.version,
          userId,
          item.note,
          tx,
        );
        updated.push({
          id: record.id,
          offerId: offer.id,
          variantId: offer.variantId,
          sellerSku: offer.sellerSku,
          listingTitle: offer.listingTitle,
          onHand: record.onHand,
          reserved: record.reserved,
          available: record.onHand - record.reserved,
          version: record.version,
          updatedAt: record.updatedAt,
        });
      }
      return updated;
    });
  }

  async movements(
    userId: string,
    offerId: string,
  ): Promise<InventoryMovement[]> {
    const seller = await this.sellers.mine(userId);
    const offer = await this.offers.find(offerId);
    if (!offer || offer.sellerId !== seller.id)
      throw new NotFoundException('Offer not found');
    const record = await this.prisma.inventoryRecord.findUnique({
      where: { offerId },
    });
    if (!record) return [];
    return this.inventory.listMovements(record.id);
  }
}
