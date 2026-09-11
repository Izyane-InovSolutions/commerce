import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Offer, Price } from '@prisma/client';

import { ProductReferencesService } from '../products/product-references.service';
import { PrismaService } from '../../database/prisma.service';
import { UpdateStatusDto } from '../../common/catalog/dto/update-status.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { CreatePriceDto } from './dto/create-price.dto';

export type OfferWithPrices = Offer & { prices: Price[] };

@Injectable()
export class OffersService {
  constructor(private readonly prisma: PrismaService, private readonly products:ProductReferencesService) {}

  async findByIdAdmin(id: string): Promise<OfferWithPrices> {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: { prices: { orderBy: { startsAt: 'desc' } } },
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    return offer;
  }

  async create(dto: CreateOfferDto): Promise<OfferWithPrices> {
    if(!await this.products.variantExists(dto.variantId)) throw new BadRequestException('The referenced variant does not exist');

    // The admin retail creation route always creates first-party offers.
    const offer = await this.prisma.offer.create({
      data: { variantId: dto.variantId, sellerId: null },
    });
    return this.findByIdAdmin(offer.id);
  }

  async updateStatus(
    id: string,
    dto: UpdateStatusDto,
  ): Promise<OfferWithPrices> {
    this.requireFirstParty(await this.findByIdAdmin(id));
    await this.prisma.offer.update({
      where: { id },
      data: { status: dto.status },
    });
    return this.findByIdAdmin(id);
  }

  async remove(id: string): Promise<void> {
    this.requireFirstParty(await this.findByIdAdmin(id));
    await this.prisma.offer.delete({ where: { id } });
  }

  async addPrice(
    offerId: string,
    dto: CreatePriceDto,
  ): Promise<OfferWithPrices> {
    this.requireFirstParty(await this.findByIdAdmin(offerId));

    if (dto.endsAt && dto.startsAt && dto.endsAt <= dto.startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    await this.prisma.price.create({
      data: {
        offerId,
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
      },
    });

    return this.findByIdAdmin(offerId);
  }

  private requireFirstParty(offer: Offer): void {
    if (offer.sellerId)
      throw new BadRequestException(
        'Seller offers must use the seller workflow; admin can suspend the seller account',
      );
  }
}
