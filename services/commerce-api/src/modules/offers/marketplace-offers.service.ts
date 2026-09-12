import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus, SellerStatus } from '@prisma/client';
import type { Offer, Price, Seller } from '@prisma/client';
import { ProductReferencesService } from '../products/product-references.service';
import { PrismaService } from '../../database/prisma.service';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import {
  currentPrices,
  pickCurrentPrice,
} from '../../common/catalog/current-price';
import { SellersService } from '../sellers/sellers.service';
import {
  StorefrontsService,
  PUBLIC_STOREFRONT_SELECT,
} from '../sellers/storefronts.service';
import type { PublicStorefront } from '../sellers/storefronts.service';
import {
  CreateSellerOfferDto,
  UpdateSellerOfferDto,
  SellerOfferStatusDto,
  SellerOfferPriceDto,
} from './dto/seller-offer.dto';

export type SellerOffer = Offer & { prices: Price[] };
export type ComparableOffer = {
  id: string;
  variantId: string;
  listingTitle: string | null;
  seller: PublicStorefront | null;
  isFirstParty: boolean;
  condition: Offer['condition'];
  stockSource: Offer['stockSource'];
  fulfillmentMode: Offer['fulfillmentMode'];
  /** Null only from the by-id lookup, which does not filter on currency. */
  currentPrice: { amount: number; currency: string } | null;
  /** Every currency this offer currently carries a price in. */
  currencies: string[];
  checkoutSupported: boolean;
};
export type OfferPage<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};
const withPrices = {
  prices: {
    orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  },
} satisfies Prisma.OfferInclude;

@Injectable()
export class MarketplaceOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellers: SellersService,
    private readonly storefronts: StorefrontsService,
    private readonly products: ProductReferencesService,
  ) {}

  async create(
    userId: string,
    dto: CreateSellerOfferDto,
  ): Promise<SellerOffer> {
    return this.write(async (tx) => {
      const seller = await this.sellers.lockApproved(userId, tx);
      await this.products.requirePublishedVariant(dto.variantId, tx);
      const offer = await tx.offer.create({
        data: { ...dto, sellerSku: dto.sellerSku.trim(), sellerId: seller.id },
        include: withPrices,
      });
      await this.audit(tx, userId, offer.id, 'offer.created');
      return offer;
    });
  }

  async listOwn(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<OfferPage<SellerOffer>> {
    const seller = await this.sellers.mine(userId);
    const where = { sellerId: seller.id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where,
        include: withPrices,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.offer.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async findOwn(userId: string, id: string): Promise<SellerOffer> {
    const seller = await this.sellers.mine(userId);
    return this.owned(this.prisma, seller.id, id);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateSellerOfferDto,
  ): Promise<SellerOffer> {
    return this.write(async (tx) => {
      const seller = await this.sellers.lockApproved(userId, tx);
      const offer = await this.owned(tx, seller.id, id);
      if (offer.status !== ProductStatus.DRAFT)
        throw new ConflictException(
          'Unpublish the offer before editing listing details',
        );
      const { version, ...details } = dto;
      await this.change(tx, offer, version, {
        ...details,
        sellerSku: details.sellerSku.trim(),
      });
      await this.audit(tx, userId, id, 'offer.updated');
      return this.owned(tx, seller.id, id);
    });
  }

  async status(
    userId: string,
    id: string,
    dto: SellerOfferStatusDto,
  ): Promise<SellerOffer> {
    return this.write(async (tx) => {
      const seller = await this.sellers.lockApproved(userId, tx);
      const offer = await this.owned(tx, seller.id, id);
      if (offer.status === ProductStatus.ARCHIVED)
        throw new ConflictException('Archived offers cannot be changed');
      if (dto.status === ProductStatus.PUBLISHED)
        await this.validatePublish(tx, seller, offer);
      await this.change(tx, offer, dto.version, { status: dto.status });
      await this.audit(tx, userId, id, 'offer.status_changed', {
        from: offer.status,
        to: dto.status,
      });
      return this.owned(tx, seller.id, id);
    });
  }

  async price(
    userId: string,
    id: string,
    dto: SellerOfferPriceDto,
  ): Promise<SellerOffer> {
    return this.write(async (tx) => {
      const seller = await this.sellers.lockApproved(userId, tx);
      const offer = await this.owned(tx, seller.id, id);
      if (offer.status === ProductStatus.ARCHIVED)
        throw new ConflictException('Archived offers cannot be changed');
      if (offer.prices.some((price) => price.currency !== dto.currency))
        throw new BadRequestException(
          'Use a separate offer for a different currency',
        );
      await this.change(tx, offer, dto.version, {});
      const now = new Date();
      await tx.price.updateMany({
        where: { offerId: id, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        data: { endsAt: now },
      });
      await tx.price.create({
        data: {
          offerId: id,
          amount: dto.amount,
          currency: dto.currency,
          startsAt: now,
        },
      });
      await this.audit(tx, userId, id, 'offer.price_changed', {
        amount: dto.amount,
        currency: dto.currency,
      });
      return this.owned(tx, seller.id, id);
    });
  }

  async compare(
    variantId: string,
    query: PaginationQueryDto,
    currency: string,
  ): Promise<OfferPage<ComparableOffer>> {
    await this.products.requirePublishedVariant(variantId);
    return this.publicPage({ variantId }, query, currency);
  }

  async storefrontOffers(
    slug: string,
    query: PaginationQueryDto,
    currency: string,
  ): Promise<OfferPage<ComparableOffer>> {
    const storefront = await this.storefronts.findPublic(slug);
    return this.publicPage({ sellerId: storefront.id }, query, currency);
  }

  /**
   * One offer, looked up by id.
   *
   * Unlike the comparison views this does not filter on currency: it answers
   * "what is this offer?", and a client resolving a cart or order line needs
   * it back even when the line is priced in a currency the shopper is not
   * browsing in. The price is resolved in the requested currency and is null
   * when there is none, with `currencies` saying what it does carry.
   */
  async findPublic(id: string, currency: string): Promise<ComparableOffer> {
    const offer = await this.prisma.offer.findFirst({
      where: {
        id,
        status: ProductStatus.PUBLISHED,
        variant: {
          status: ProductStatus.PUBLISHED,
          product: { status: ProductStatus.PUBLISHED },
        },
      },
      include: {
        seller: { select: PUBLIC_STOREFRONT_SELECT },
        ...withPrices,
      },
    });
    if (!offer) throw new NotFoundException('Offer not found');

    const price = pickCurrentPrice(offer.prices, currency);
    return {
      id: offer.id,
      variantId: offer.variantId,
      listingTitle: offer.listingTitle,
      seller: offer.seller,
      isFirstParty: offer.sellerId === null,
      condition: offer.condition,
      stockSource: offer.stockSource,
      fulfillmentMode: offer.fulfillmentMode,
      currentPrice: price
        ? { amount: price.amount, currency: price.currency }
        : null,
      currencies: currentPrices(offer.prices)
        .map((each) => each.currency)
        .sort(),
      checkoutSupported: offer.sellerId === null,
    };
  }

  private async publicPage(
    filter: Prisma.OfferWhereInput,
    query: PaginationQueryDto,
    currency: string,
  ): Promise<OfferPage<ComparableOffer>> {
    const now = new Date();
    // Narrowed by currency as well as by window, so an offer priced only in
    // another currency is absent from the comparison rather than listed at a
    // number the shopper cannot pay.
    const currentPrice: Prisma.PriceWhereInput = {
      currency,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    };
    const where: Prisma.OfferWhereInput = {
      ...filter,
      status: ProductStatus.PUBLISHED,
      variant: {
        status: ProductStatus.PUBLISHED,
        product: { status: ProductStatus.PUBLISHED },
      },
      prices: { some: currentPrice },
      OR: [
        { sellerId: null },
        {
          seller: {
            is: {
              status: SellerStatus.APPROVED,
              storefrontSlug: { not: null },
              displayName: { not: null },
              ownerUser: { isActive: true },
            },
          },
        },
      ],
    };
    const [offers, total] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where,
        include: {
          seller: { select: PUBLIC_STOREFRONT_SELECT },
          prices: { ...withPrices.prices, where: currentPrice, take: 1 },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.offer.count({ where }),
    ]);
    const items = offers.map((offer) => {
      const price = offer.prices[0];
      if (!price)
        throw new ConflictException(
          'Offer pricing changed; reload the comparison',
        );
      return {
        id: offer.id,
        variantId: offer.variantId,
        listingTitle: offer.listingTitle,
        seller: offer.seller,
        isFirstParty: offer.sellerId === null,
        condition: offer.condition,
        stockSource: offer.stockSource,
        fulfillmentMode: offer.fulfillmentMode,
        currentPrice: {
          amount: price.amount,
          currency: price.currency,
        },
        currencies: [price.currency],
        checkoutSupported: offer.sellerId === null,
      };
    });
    return { items, total, page: query.page, limit: query.limit };
  }

  private async validatePublish(
    tx: Prisma.TransactionClient,
    seller: Seller,
    offer: SellerOffer,
  ): Promise<void> {
    if (!seller.storefrontSlug || !seller.displayName)
      throw new BadRequestException(
        'Complete the storefront before publishing',
      );
    if (!offer.sellerSku || !offer.listingTitle)
      throw new BadRequestException(
        'Seller SKU and listing title are required',
      );
    await this.products.requirePublishedVariant(offer.variantId, tx);
    const priced = currentPrices(offer.prices).filter(
      (price) => price.amount > 0,
    );
    if (!priced.length)
      throw new BadRequestException('A current positive price is required');
  }

  private async owned(
    tx: Prisma.TransactionClient,
    sellerId: string,
    id: string,
  ): Promise<SellerOffer> {
    const offer = await tx.offer.findFirst({
      where: { id, sellerId },
      include: withPrices,
    });
    if (!offer) throw new NotFoundException('Offer not found');
    return offer;
  }

  private async change(
    tx: Prisma.TransactionClient,
    offer: SellerOffer,
    version: number,
    data: Prisma.OfferUpdateManyMutationInput,
  ): Promise<void> {
    const changed = await tx.offer.updateMany({
      where: { id: offer.id, sellerId: offer.sellerId, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (changed.count !== 1)
      throw new ConflictException('Offer changed; reload and try again');
  }

  private async write<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(callback);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Seller SKU is already in use');
      throw error;
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    targetId: string,
    action: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.auditEvent.create({
      data: { actorUserId, targetId, targetType: 'Offer', action, metadata },
    });
  }
}
