import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Offer, Prisma, Price } from '@prisma/client';

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from '../../common/pagination/pagination-query.dto';

import { ProductReferencesService } from '../products/product-references.service';
import { PrismaService } from '../../database/prisma.service';
import { UpdateStatusDto } from '../../common/catalog/dto/update-status.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { CreatePriceDto } from './dto/create-price.dto';
import { ListAdminOffersDto } from './dto/list-admin-offers.dto';
import { UpdateOfferShippingDto } from './dto/update-offer-shipping.dto';

export type OfferWithPrices = Offer & { prices: Price[] };

export type AdminOfferPage = {
  items: OfferWithPrices[];
  total: number;
  page: number;
  limit: number;
};

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductReferencesService,
  ) {}

  /** Every offer — first-party and marketplace — newest first, in the same
   * shape as the single-offer admin read. */
  async listAdmin(query: ListAdminOffersDto): Promise<AdminOfferPage> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.OfferWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.sellerId ? { sellerId: query.sellerId } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.productId ? { variant: { productId: query.productId } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where,
        include: { prices: { orderBy: { startsAt: 'desc' } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.offer.count({ where }),
    ]);

    return { items, total, page, limit };
  }

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
    if (!(await this.products.variantExists(dto.variantId)))
      throw new BadRequestException('The referenced variant does not exist');

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

  async updateShipping(
    id: string,
    dto: UpdateOfferShippingDto,
  ): Promise<OfferWithPrices> {
    this.requireFirstParty(await this.findByIdAdmin(id));

    await this.prisma.offer.update({
      where: { id },
      data: {
        shippingAmount: dto.amount,
        shippingCurrency: dto.amount === null ? null : dto.currency,
      },
    });

    return this.findByIdAdmin(id);
  }

  private requireFirstParty(offer: Offer): void {
    if (offer.sellerId)
      throw new BadRequestException(
        'Seller offers must use the seller workflow; admin can suspend the seller account',
      );
  }
}
