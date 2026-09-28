import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MediaStatus,
  OfferStockSource,
  OrderStatus,
  Prisma,
  ProductRatingSummary,
  ProductStatus,
  ProductSubmissionStatus,
  ReviewVisibility,
  SellerStatus,
  type ProductVariant,
} from '@prisma/client';

import {
  PaginatedResult,
  paginatedResult,
} from '../../common/pagination/paginated-result';
import { parseSort } from '../../common/pagination/sort.dto';
import { CategoryAttributesService } from '../catalog/categories/category-attributes.service';
import { InventoryService } from '../inventory/inventory.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../../database/prisma.service';
import {
  currentPrices,
  pickSale,
  pickCurrentPrice,
} from '../../common/catalog/current-price';
import {
  averageRatingFromSummary,
  ratingHistogramFromSummary,
} from '../reviews/rating-summary.util';
import { formatReviewerLabel } from '../reviews/reviewer-label';
import { reviewOrderBy } from '../reviews/review-sort';
import { ReviewListQueryDto } from '../reviews/dto/review-list-query.dto';
import { SellersService } from '../sellers/sellers.service';
import { PUBLIC_STOREFRONT_SELECT } from '../sellers/storefronts.service';
import { AttachMediaDto } from './dto/attach-media.dto';
import { BestSellersQueryDto } from './dto/best-sellers-query.dto';
import { DealsQueryDto } from './dto/deals-query.dto';
import { priceLeadShare, withPriceLeads } from './price-lead';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ReviewProductSubmissionDto } from './dto/review-product-submission.dto';
import { UpdateProductMediaDto } from './dto/update-product-media.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { UpdateStatusDto } from '../../common/catalog/dto/update-status.dto';
import { SellerUpdateProductDto } from './dto/seller-update-product.dto';
import { searchTerms } from './product-search';
import {
  BestSellersResult,
  DealsResult,
  ProductRowWithRelations,
  ProductWithRelations,
  PublicProduct,
  PublicProductReview,
  VariantWithRelations,
} from './products.types';

/**
 * What a catalog response carries about an attached asset.
 *
 * A select rather than an include: the full row holds `byteSize`, a BigInt
 * that JSON.stringify throws on — which used to take down every admin product
 * read as soon as one product had an image — along with storage details that
 * are the media module's business, not the catalog's.
 */
const PRODUCT_MEDIA_ASSET_SELECT = {
  id: true,
  mimeType: true,
  originalFileName: true,
  status: true,
} as const;

const PRODUCT_MEDIA_INCLUDE = {
  orderBy: { position: 'asc' as const },
  include: { mediaAsset: { select: PRODUCT_MEDIA_ASSET_SELECT } },
} as const;

/**
 * An offer is publicly showable either because it's the platform's own
 * (`sellerId: null`) or because the seller behind it is approved and has
 * finished setting up their storefront — the same eligibility marketplace
 * offer comparisons already apply (MarketplaceOffersService.publicPage).
 * A pending/rejected/suspended seller's offers stay invisible even if
 * published, same as an incomplete storefront's.
 */
/** Products scanned for a live sale before ranking; deals are few. */
const DEAL_CANDIDATES = 200;

const PUBLICLY_ELIGIBLE_OFFER: Prisma.OfferWhereInput = {
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

/** What every public catalog read loads: only published variants, and only
 * the published, publicly eligible offers on them. */
const PUBLIC_PRODUCT_INCLUDE = {
  brand: true,
  category: true,
  media: PRODUCT_MEDIA_INCLUDE,
  variants: {
    where: { status: ProductStatus.PUBLISHED },
    include: {
      attributeValues: {
        include: { attributeValue: { include: { attribute: true } } },
      },
      offers: {
        where: { status: ProductStatus.PUBLISHED, ...PUBLICLY_ELIGIBLE_OFFER },
        include: {
          prices: true,
          seller: { select: PUBLIC_STOREFRONT_SELECT },
        },
      },
    },
  },
} satisfies Prisma.ProductInclude;

/** Orders that collected money — a later refund doesn't un-sell them. */
const PAID_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PARTIALLY_REFUNDED,
  OrderStatus.REFUNDED,
];

/** How many ranked candidates are checked for public eligibility per query
 * while filling a best-seller list. */
const BEST_SELLER_BATCH = 100;

const PRODUCT_DETAIL_INCLUDE = {
  brand: true,
  category: true,
  media: PRODUCT_MEDIA_INCLUDE,
  variants: {
    include: {
      attributeValues: {
        include: { attributeValue: { include: { attribute: true } } },
      },
      offers: { include: { prices: true } },
    },
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly inventory: InventoryService,
    private readonly sellers: SellersService,
    private readonly categoryAttributes: CategoryAttributesService,
  ) {}

  async findPublished(
    query: ProductQueryDto,
  ): Promise<PaginatedResult<PublicProduct>> {
    const where = await this.buildPublicWhere(query);
    const orderBy = this.buildOrderBy(query.sort, query.featured);

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: PUBLIC_PRODUCT_INCLUDE,
      }),
      this.prisma.product.count({ where }),
    ]);

    const [stock, ratingSummaries] = await Promise.all([
      this.loadStock(products),
      this.loadRatingSummaries(products),
    ]);

    return paginatedResult(
      products.map((product) =>
        this.toPublicProduct(
          product,
          query.currency,
          stock,
          ratingSummaries.get(product.id),
        ),
      ),
      query.page,
      query.limit,
      total,
    );
  }

  async findPublishedBySlug(
    slug: string,
    currency: string,
  ): Promise<PublicProduct> {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.PUBLISHED },
      include: PUBLIC_PRODUCT_INCLUDE,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const [stock, ratingSummaries] = await Promise.all([
      this.loadStock([product]),
      this.loadRatingSummaries([product]),
    ]);

    return this.toPublicProduct(
      product,
      currency,
      stock,
      ratingSummaries.get(product.id),
    );
  }

  /**
   * Published products ranked by units sold on paid orders created in the
   * last `days` days, in exactly the product listing's item shape.
   *
   * Ranking is done in SQL over every product sold in the window; public
   * eligibility (a published variant carrying a published offer a shopper
   * can actually buy from) is then checked in rank order, a batch at a
   * time, until `limit` products qualify — so an ineligible top seller
   * never leaves the list short.
   */
  async findBestSellers(query: BestSellersQueryDto): Promise<BestSellersResult> {
    const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
    const ranked = await this.prisma.$queryRaw<{ productId: string }[]>`
      SELECT v.product_id AS "productId"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN offers f ON f.id = oi.offer_id
      JOIN product_variants v ON v.id = f.variant_id
      JOIN products p ON p.id = v.product_id
      WHERE o.status::text IN (${Prisma.join(PAID_ORDER_STATUSES)})
        AND o.created_at >= (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND p.status::text = ${ProductStatus.PUBLISHED}
      GROUP BY v.product_id
      ORDER BY SUM(oi.quantity) DESC, v.product_id
    `;

    const eligibleIds: string[] = [];
    for (
      let offset = 0;
      offset < ranked.length && eligibleIds.length < query.limit;
      offset += BEST_SELLER_BATCH
    ) {
      const batch = ranked
        .slice(offset, offset + BEST_SELLER_BATCH)
        .map((row) => row.productId);
      const eligible = await this.prisma.product.findMany({
        where: {
          id: { in: batch },
          status: ProductStatus.PUBLISHED,
          variants: {
            some: {
              status: ProductStatus.PUBLISHED,
              offers: {
                some: {
                  status: ProductStatus.PUBLISHED,
                  ...PUBLICLY_ELIGIBLE_OFFER,
                },
              },
            },
          },
        },
        select: { id: true },
      });
      const eligibleSet = new Set(eligible.map((product) => product.id));
      for (const id of batch) {
        if (eligibleSet.has(id) && eligibleIds.length < query.limit)
          eligibleIds.push(id);
      }
    }

    if (eligibleIds.length === 0) return { items: [] };

    const products = await this.prisma.product.findMany({
      where: { id: { in: eligibleIds } },
      include: PUBLIC_PRODUCT_INCLUDE,
    });
    const rank = new Map(eligibleIds.map((id, index) => [id, index]));
    products.sort(
      (left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0),
    );

    const [stock, ratingSummaries] = await Promise.all([
      this.loadStock(products),
      this.loadRatingSummaries(products),
    ]);

    return {
      items: products.map((product) =>
        this.toPublicProduct(
          product,
          query.currency,
          stock,
          ratingSummaries.get(product.id),
        ),
      ),
    };
  }

  /**
   * Public reviews for a product's page — PUBLISHED only, regardless of
   * moderationState (a PENDING/FLAGGED review still shows publicly under the
   * publish-then-moderate policy; only HIDDEN/REMOVED/WITHDRAWN are excluded).
   * Never projects authorUserId, orderItemId, moderationState, reports, or
   * revision history — see PublicProductReview.
   */
  async findPublicReviews(
    slug: string,
    query: ReviewListQueryDto,
  ): Promise<PaginatedResult<PublicProductReview>> {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.PUBLISHED },
      select: { id: true, name: true, slug: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const where: Prisma.ProductReviewWhereInput = {
      productId: product.id,
      visibility: ReviewVisibility.PUBLISHED,
      ...(query.rating ? { rating: query.rating } : {}),
    };

    const [reviews, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        orderBy: reviewOrderBy(query.sort),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { firstName: true, lastName: true } },
          seller: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.productReview.count({ where }),
    ]);

    return paginatedResult(
      reviews.map(
        (review): PublicProductReview => ({
          id: review.id,
          rating: review.rating,
          title: review.title,
          body: review.body,
          reviewerLabel: formatReviewerLabel(
            review.author.firstName,
            review.author.lastName,
          ),
          verifiedPurchase: true,
          createdAt: review.createdAt,
          updatedAt: review.updatedAt,
          product: { id: product.id, name: product.name, slug: product.slug },
          seller: review.seller
            ? { id: review.seller.id, displayName: review.seller.displayName }
            : null,
        }),
      ),
      query.page,
      query.limit,
      total,
    );
  }

  async findAllAdmin(): Promise<ProductWithRelations[]> {
    const products = await this.prisma.product.findMany({
      include: PRODUCT_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return products.map((product) => this.withMediaUrls(product));
  }

  async findByIdAdmin(id: string): Promise<ProductWithRelations> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_DETAIL_INCLUDE,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.withMediaUrls(product);
  }

  /**
   * Signs each attached image so an administrator can actually see it.
   *
   * The media module's own download URL is owner-only, which would mean only
   * whoever uploaded an image could view it — no use in a portal several
   * people share.
   */
  private withMediaUrls(
    product: ProductRowWithRelations,
  ): ProductWithRelations {
    return {
      ...product,
      media: product.media.map((media) => ({
        ...media,
        url:
          media.mediaAsset.status === MediaStatus.AVAILABLE
            ? this.media.createProductDownloadUrl(media.mediaAssetId).url
            : null,
      })),
    };
  }

  async create(dto: CreateProductDto): Promise<ProductWithRelations> {
    try {
      const product = await this.prisma.product.create({ data: dto });
      return this.findByIdAdmin(product.id);
    } catch (error) {
      throw this.mapWriteError(
        error,
        'A product with this slug already exists',
      );
    }
  }

  async update(
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductWithRelations> {
    await this.findByIdAdmin(id);

    try {
      await this.prisma.product.update({ where: { id }, data: dto });
      return this.findByIdAdmin(id);
    } catch (error) {
      throw this.mapWriteError(
        error,
        'A product with this slug already exists',
      );
    }
  }

  async updateStatus(
    id: string,
    dto: UpdateStatusDto,
  ): Promise<ProductWithRelations> {
    await this.findByIdAdmin(id);
    await this.prisma.product.update({
      where: { id },
      data: { status: dto.status },
    });
    return this.findByIdAdmin(id);
  }

  /**
   * Hard delete, for drafts and mistakes only. Order items cascade from
   * offers, which cascade from variants — deleting anything that has sold or
   * held stock would silently erase order lines and inventory movements, so
   * that is refused and the caller is pointed at ARCHIVED instead.
   */
  async remove(id: string): Promise<void> {
    await this.findByIdAdmin(id);
    await this.deleteUnlessUsed({ productId: id }, 'This product', (tx) =>
      tx.product.delete({ where: { id } }),
    );
  }

  async addVariant(
    productId: string,
    dto: CreateVariantDto,
  ): Promise<VariantWithRelations> {
    await this.findByIdAdmin(productId);

    try {
      const variant = await this.prisma.$transaction(async (tx) => {
        await this.assertVariantAttributes(
          tx,
          productId,
          dto.attributeValueIds ?? [],
        );
        const created = await tx.productVariant.create({
          data: { productId, skuCode: dto.skuCode, name: dto.name },
        });

        if (dto.attributeValueIds?.length) {
          await tx.productVariantAttributeValue.createMany({
            data: dto.attributeValueIds.map((attributeValueId) => ({
              variantId: created.id,
              attributeValueId,
            })),
          });
        }

        return created;
      });

      return this.findVariantOrThrow(variant.id);
    } catch (error) {
      throw this.mapWriteError(
        error,
        'A variant with this SKU code already exists',
      );
    }
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ): Promise<VariantWithRelations> {
    await this.findProductVariant(productId, variantId);

    try {
      await this.prisma.$transaction((tx) =>
        this.writeVariant(tx, productId, variantId, dto),
      );

      return this.findVariantOrThrow(variantId);
    } catch (error) {
      throw this.mapWriteError(
        error,
        'A variant with this SKU code already exists',
      );
    }
  }

  async updateVariantStatus(
    productId: string,
    variantId: string,
    dto: UpdateStatusDto,
  ): Promise<VariantWithRelations> {
    await this.findProductVariant(productId, variantId);
    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { status: dto.status },
    });
    return this.findVariantOrThrow(variantId);
  }

  /** Same guard as {@link remove}, scoped to one variant. */
  async removeVariant(productId: string, variantId: string): Promise<void> {
    await this.findProductVariant(productId, variantId);
    await this.deleteUnlessUsed({ id: variantId }, 'This variant', (tx) =>
      tx.productVariant.delete({ where: { id: variantId } }),
    );
  }

  async attachMedia(
    productId: string,
    dto: AttachMediaDto,
  ): Promise<ProductWithRelations> {
    await this.findByIdAdmin(productId);

    await this.media.requireProductAsset(dto.mediaAssetId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.media.lockForProductAttachment(dto.mediaAssetId, tx);
        if (dto.isPrimary) {
          await tx.productMedia.updateMany({
            where: { productId },
            data: { isPrimary: false },
          });
        }

        await tx.productMedia.create({
          data: {
            productId,
            mediaAssetId: dto.mediaAssetId,
            position: dto.position ?? 0,
            isPrimary: dto.isPrimary ?? false,
          },
        });
      });

      return this.findByIdAdmin(productId);
    } catch (error) {
      throw this.mapWriteError(
        error,
        'This media asset is already attached to the product',
      );
    }
  }

  async updateMedia(
    productId: string,
    productMediaId: string,
    dto: UpdateProductMediaDto,
  ): Promise<ProductWithRelations> {
    await this.findProductMedia(productId, productMediaId);

    await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.productMedia.updateMany({
          where: { productId },
          data: { isPrimary: false },
        });
      }

      await tx.productMedia.update({
        where: { id: productMediaId },
        data: dto,
      });
    });

    return this.findByIdAdmin(productId);
  }

  async detachMedia(productId: string, productMediaId: string): Promise<void> {
    await this.findProductMedia(productId, productMediaId);
    await this.prisma.productMedia.delete({ where: { id: productMediaId } });
  }

  // ---------------------------------------------------------------------
  // Seller product submissions — a brand-new catalog product a seller
  // creates themselves, rather than listing an offer against one the
  // platform already published. Held at PENDING until an admin reviews it;
  // everything else (variant, media) is the same shape admin-created
  // products use, just scoped to the submitting seller until approved.
  // ---------------------------------------------------------------------

  async submitProduct(
    userId: string,
    dto: CreateProductDto,
  ): Promise<ProductWithRelations> {
    const seller = await this.sellers.requireApproved(userId);

    try {
      const product = await this.prisma.product.create({
        data: {
          ...dto,
          createdBySellerId: seller.id,
          submissionStatus: ProductSubmissionStatus.PENDING,
        },
      });
      return this.findOwnSubmission(userId, product.id);
    } catch (error) {
      throw this.mapWriteError(
        error,
        'A product with this slug already exists',
      );
    }
  }

  async addSellerVariant(
    userId: string,
    productId: string,
    dto: CreateVariantDto,
  ): Promise<VariantWithRelations> {
    await this.ownedSubmission(userId, productId);

    try {
      const variant = await this.prisma.$transaction(async (tx) => {
        await this.assertVariantAttributes(
          tx,
          productId,
          dto.attributeValueIds ?? [],
        );
        const created = await tx.productVariant.create({
          data: { productId, skuCode: dto.skuCode, name: dto.name },
        });

        if (dto.attributeValueIds?.length) {
          await tx.productVariantAttributeValue.createMany({
            data: dto.attributeValueIds.map((attributeValueId) => ({
              variantId: created.id,
              attributeValueId,
            })),
          });
        }

        return created;
      });

      return this.findVariantOrThrow(variant.id);
    } catch (error) {
      throw this.mapWriteError(
        error,
        'A variant with this SKU code already exists',
      );
    }
  }

  async attachSellerMedia(
    userId: string,
    productId: string,
    dto: AttachMediaDto,
  ): Promise<ProductWithRelations> {
    await this.ownedSubmission(userId, productId);
    await this.requireOwnedMediaAsset(userId, dto.mediaAssetId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.media.lockForProductAttachment(dto.mediaAssetId, tx);
        if (dto.isPrimary) {
          await tx.productMedia.updateMany({
            where: { productId },
            data: { isPrimary: false },
          });
        }

        await tx.productMedia.create({
          data: {
            productId,
            mediaAssetId: dto.mediaAssetId,
            position: dto.position ?? 0,
            isPrimary: dto.isPrimary ?? false,
          },
        });
      });

      return this.findOwnSubmission(userId, productId);
    } catch (error) {
      throw this.mapWriteError(
        error,
        'This media asset is already attached to the product',
      );
    }
  }

  /**
   * Seller edits follow the submission lifecycle:
   *
   * - PENDING: edited in place; still waiting on review.
   * - REJECTED: edited and automatically resubmitted — back to PENDING with
   *   the previous decision cleared, so the fix lands in the review queue.
   * - APPROVED: refused (409). The product is live and shared — other
   *   sellers may list offers against it — so a seller edit would bypass
   *   review on a public page; the platform team changes it instead.
   *
   * The status check and the resubmission are one conditional write inside
   * the edit's own transaction, so an admin decision racing the edit either
   * lands first (and the edit is refused) or sees the edited product.
   */
  async updateSellerProduct(
    userId: string,
    productId: string,
    dto: SellerUpdateProductDto,
  ): Promise<ProductWithRelations> {
    const sellerId = await this.requireOwnedProduct(userId, productId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.claimForSellerEdit(tx, sellerId, productId);
        await tx.product.update({ where: { id: productId }, data: dto });
      });
    } catch (error) {
      throw this.mapWriteError(
        error,
        'A product with this slug already exists',
      );
    }

    return this.findOwnSubmission(userId, productId);
  }

  /** Same lifecycle rules as {@link updateSellerProduct}. */
  async updateSellerVariant(
    userId: string,
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ): Promise<VariantWithRelations> {
    const sellerId = await this.requireOwnedProduct(userId, productId);
    await this.findProductVariant(productId, variantId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.claimForSellerEdit(tx, sellerId, productId);
        await this.writeVariant(tx, productId, variantId, dto);
      });
    } catch (error) {
      throw this.mapWriteError(
        error,
        'A variant with this SKU code already exists',
      );
    }

    return this.findVariantOrThrow(variantId);
  }

  /**
   * Deletes the seller's own unapproved submission, behind the same
   * order/stock-history guard as the admin delete. An approved product is
   * refused for the reason {@link updateSellerProduct} gives.
   */
  async removeSellerProduct(userId: string, productId: string): Promise<void> {
    const sellerId = await this.requireOwnedProduct(userId, productId);
    await this.deleteUnlessUsed(
      { productId },
      'This product',
      async (tx) => {
        await this.claimForSellerEdit(tx, sellerId, productId);
        await tx.product.delete({ where: { id: productId } });
      },
    );
  }

  /** Removing a variant is an edit: a rejected submission is resubmitted. */
  async removeSellerVariant(
    userId: string,
    productId: string,
    variantId: string,
  ): Promise<void> {
    const sellerId = await this.requireOwnedProduct(userId, productId);
    await this.findProductVariant(productId, variantId);
    await this.deleteUnlessUsed(
      { id: variantId },
      'This variant',
      async (tx) => {
        await this.claimForSellerEdit(tx, sellerId, productId);
        await tx.productVariant.delete({ where: { id: variantId } });
      },
    );
  }

  async listOwnSubmissions(userId: string): Promise<ProductWithRelations[]> {
    const seller = await this.sellers.mine(userId);
    const products = await this.prisma.product.findMany({
      where: { createdBySellerId: seller.id },
      include: PRODUCT_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return products.map((product) => this.withMediaUrls(product));
  }

  async findOwnSubmission(
    userId: string,
    id: string,
  ): Promise<ProductWithRelations> {
    const seller = await this.sellers.mine(userId);
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_DETAIL_INCLUDE,
    });
    if (!product || product.createdBySellerId !== seller.id)
      throw new NotFoundException('Product not found');
    return this.withMediaUrls(product);
  }

  /** Every seller-submitted product waiting on a decision — the admin
   * review queue. */
  async listPendingSubmissions(): Promise<ProductWithRelations[]> {
    const products = await this.prisma.product.findMany({
      where: {
        createdBySellerId: { not: null },
        submissionStatus: ProductSubmissionStatus.PENDING,
      },
      include: PRODUCT_DETAIL_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return products.map((product) => this.withMediaUrls(product));
  }

  /**
   * Approves or rejects a seller-submitted product. Approving publishes it
   * — and every variant on it — in the same step, rather than leaving the
   * seller a separate "now go publish it" click once an admin has already
   * signed off; rejecting leaves it Draft with a reason attached.
   */
  async reviewSubmission(
    actorUserId: string,
    id: string,
    status: 'APPROVED' | 'REJECTED',
    dto: ReviewProductSubmissionDto,
  ): Promise<ProductWithRelations> {
    const targetStatus =
      status === 'APPROVED'
        ? ProductSubmissionStatus.APPROVED
        : ProductSubmissionStatus.REJECTED;

    await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id } });
      if (!product || !product.createdBySellerId)
        throw new NotFoundException('Product submission not found');

      const claimed = await tx.product.updateMany({
        where: { id, submissionStatus: ProductSubmissionStatus.PENDING },
        data: {
          submissionStatus: targetStatus,
          reviewReason: dto.reason,
          reviewedBy: actorUserId,
          reviewedAt: new Date(),
          ...(targetStatus === ProductSubmissionStatus.APPROVED
            ? { status: ProductStatus.PUBLISHED }
            : {}),
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException(
          'This submission has already been reviewed',
        );

      if (targetStatus === ProductSubmissionStatus.APPROVED) {
        await tx.productVariant.updateMany({
          where: { productId: id },
          data: { status: ProductStatus.PUBLISHED },
        });
      }
    });

    return this.findByIdAdmin(id);
  }

  /** Confirms the product exists, is this seller's own submission, and
   * hasn't already been decided — the gate every write against a
   * submission (adding a variant, attaching media) shares. */
  private async ownedSubmission(
    userId: string,
    productId: string,
  ): Promise<void> {
    const seller = await this.sellers.requireApproved(userId);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || product.createdBySellerId !== seller.id)
      throw new NotFoundException('Product not found');
    if (product.submissionStatus !== ProductSubmissionStatus.PENDING)
      throw new ConflictException(
        'This submission has already been reviewed',
      );
  }

  /** An approved seller's own submission, or 404 — never a 403 that would
   * confirm another seller's product exists. Returns the seller id. */
  private async requireOwnedProduct(
    userId: string,
    productId: string,
  ): Promise<string> {
    const seller = await this.sellers.requireApproved(userId);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { createdBySellerId: true },
    });
    if (!product || product.createdBySellerId !== seller.id)
      throw new NotFoundException('Product not found');
    return seller.id;
  }

  /** The atomic half of the seller edit gate — see updateSellerProduct. */
  private async claimForSellerEdit(
    tx: Prisma.TransactionClient,
    sellerId: string,
    productId: string,
  ): Promise<void> {
    const claimed = await tx.product.updateMany({
      where: {
        id: productId,
        createdBySellerId: sellerId,
        submissionStatus: {
          in: [
            ProductSubmissionStatus.PENDING,
            ProductSubmissionStatus.REJECTED,
          ],
        },
      },
      data: {
        submissionStatus: ProductSubmissionStatus.PENDING,
        reviewReason: null,
        reviewedBy: null,
        reviewedAt: null,
      },
    });
    if (claimed.count !== 1)
      throw new ConflictException(
        'This product has been approved and is live in the catalog; contact the platform team to change it',
      );
  }

  /**
   * Holds a variant's attribute values to its product category's attributes
   * (inherited ones included — see CategoryAttributesService.effective):
   * only those attributes, one value each, every required one present, and no
   * other variant of the product with the same combination.
   *
   * A product with no category, or whose category has no attributes
   * anywhere up its tree, is unrestricted, as every product was before
   * categories carried attributes.
   */
  private async assertVariantAttributes(
    tx: Prisma.TransactionClient,
    productId: string,
    attributeValueIds: string[],
    variantId?: string,
  ): Promise<void> {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { category: { select: { id: true, name: true } } },
    });
    if (!product?.category) return;
    const rules = await this.categoryAttributes.effective(
      product.category.id,
      tx,
    );
    if (rules.length === 0) return;

    const ids = [...new Set(attributeValueIds)];
    const values = await tx.attributeValue.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        value: true,
        attributeId: true,
        attribute: { select: { name: true } },
      },
    });
    if (values.length !== ids.length) {
      throw new BadRequestException('One of the attribute values does not exist');
    }

    const category = product.category.name;
    const allowed = new Set(rules.map((rule) => rule.attributeId));
    const perAttribute = new Map<string, number>();
    for (const value of values) {
      if (!allowed.has(value.attributeId)) {
        throw new BadRequestException(
          `${value.attribute.name} isn't an attribute of ${category}. Attach it to the category first, or choose another value.`,
        );
      }
      const count = (perAttribute.get(value.attributeId) ?? 0) + 1;
      if (count > 1) {
        throw new BadRequestException(
          `A variant can have only one ${value.attribute.name}`,
        );
      }
      perAttribute.set(value.attributeId, count);
    }

    const missing = rules.filter(
      (rule) => rule.isRequired && !perAttribute.has(rule.attributeId),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Variants in ${category} need ${missing.map((rule) => rule.name).join(', ')}`,
      );
    }

    if (ids.length === 0) return;
    const key = [...ids].sort().join(',');
    const siblings = await tx.productVariant.findMany({
      where: { productId, ...(variantId ? { id: { not: variantId } } : {}) },
      select: {
        skuCode: true,
        attributeValues: { select: { attributeValueId: true } },
      },
    });
    const duplicate = siblings.find(
      (sibling) =>
        sibling.attributeValues
          .map((entry) => entry.attributeValueId)
          .sort()
          .join(',') === key,
    );
    if (duplicate) {
      const label = values.map((value) => value.value).join(' / ');
      throw new ConflictException(
        `Variant ${duplicate.skuCode} already has ${label}`,
      );
    }
  }

  private async writeVariant(
    tx: Prisma.TransactionClient,
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ): Promise<void> {
    // Leaving attributeValueIds out keeps the variant's values as they are,
    // so a rename isn't blocked by rules added after the variant was made.
    if (dto.attributeValueIds) {
      await this.assertVariantAttributes(
        tx,
        productId,
        dto.attributeValueIds,
        variantId,
      );
    }

    await tx.productVariant.update({
      where: { id: variantId },
      data: { skuCode: dto.skuCode, name: dto.name },
    });

    if (dto.attributeValueIds) {
      await tx.productVariantAttributeValue.deleteMany({
        where: { variantId },
      });
      if (dto.attributeValueIds.length) {
        await tx.productVariantAttributeValue.createMany({
          data: dto.attributeValueIds.map((attributeValueId) => ({
            variantId,
            attributeValueId,
          })),
        });
      }
    }
  }

  /** Unlike the admin media-attach path, a seller may only attach a media
   * asset they themselves uploaded — never someone else's asset id. */
  private async requireOwnedMediaAsset(
    userId: string,
    mediaAssetId: string,
  ): Promise<void> {
    await this.media.requireProductAsset(mediaAssetId);
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaAssetId },
      select: { ownerUserId: true },
    });
    if (asset?.ownerUserId !== userId)
      throw new BadRequestException(
        'Media asset does not exist or is not available',
      );
  }

  private async findProductVariant(
    productId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });

    if (!variant || variant.productId !== productId) {
      throw new NotFoundException('Variant not found');
    }

    return variant;
  }

  private async findProductMedia(
    productId: string,
    productMediaId: string,
  ): Promise<void> {
    const media = await this.prisma.productMedia.findUnique({
      where: { id: productMediaId },
    });

    if (!media || media.productId !== productId) {
      throw new NotFoundException('Product media not found');
    }
  }

  private async findVariantOrThrow(
    variantId: string,
  ): Promise<VariantWithRelations> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        attributeValues: {
          include: { attributeValue: { include: { attribute: true } } },
        },
        offers: { include: { prices: true } },
      },
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    return variant;
  }

  private async buildPublicWhere(
    query: ProductQueryDto,
  ): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = { status: ProductStatus.PUBLISHED };

    // Every term has to match somewhere, but each may match a different
    // field: "acme red" finds a red product sold by Acme even though no one
    // field contains both words. Ordering is untouched — this only filters.
    const terms = searchTerms(query.q);
    if (terms.length) {
      where.AND = terms.map((term) => this.searchTermWhere(term));
    }

    // A category includes its sub-categories, so "Electronics" lists the
    // phones filed under Electronics › Smartphones.
    if (query.categorySlug) {
      where.categoryId = {
        in: await this.categoryAndDescendantIds(query.categorySlug),
      };
    }

    if (query.featured) {
      where.featuredAt = { not: null };
    }

    if (query.brandSlug) {
      where.brand = { slug: query.brandSlug };
    }

    if (query.attributeValueId?.length) {
      where.variants = {
        some: {
          attributeValues: {
            some: { attributeValueId: { in: query.attributeValueId } },
          },
        },
      };
    }

    return where;
  }

  /**
   * The fields one search term may match on. Each is an ILIKE '%term%'
   * under the hood, backed by the pg_trgm GIN indexes from migration
   * 20260928153000_product_search_trigram_indexes.
   */
  private searchTermWhere(term: string): Prisma.ProductWhereInput {
    const matches = { contains: term, mode: 'insensitive' } as const;
    return {
      OR: [
        { name: matches },
        { description: matches },
        { brand: { name: matches } },
        { category: { name: matches } },
        // A SKU only counts on a variant a shopper can see, so an unpublished
        // variant's code doesn't surface its product.
        {
          variants: {
            some: { status: ProductStatus.PUBLISHED, skuCode: matches },
          },
        },
        // Also finds a seller by their storefront name — a customer typing
        // "Acme" should reach Acme's listings even when the product name
        // itself doesn't contain that word. Only a seller a shopper could
        // actually buy from counts, same eligibility as PUBLICLY_ELIGIBLE_OFFER.
        {
          variants: {
            some: {
              status: ProductStatus.PUBLISHED,
              offers: {
                some: {
                  status: ProductStatus.PUBLISHED,
                  seller: {
                    is: {
                      displayName: matches,
                      status: SellerStatus.APPROVED,
                      storefrontSlug: { not: null },
                      ownerUser: { isActive: true },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    };
  }

  private buildOrderBy(
    sort: string | string[] | undefined,
    featured?: boolean,
  ): Prisma.ProductOrderByWithRelationInput[] {
    const sortFields = parseSort(sort);
    const allowedFields = new Set(['name', 'createdAt']);
    const orderBy = sortFields
      .filter((field) => allowedFields.has(field.field))
      .map((field) => ({ [field.field]: field.order }));

    if (orderBy.length > 0) return orderBy;
    return featured
      ? [{ featuredAt: 'desc' }, { createdAt: 'desc' }]
      : [{ createdAt: 'desc' }];
  }

  /** The category's id plus every sub-category's, however deep. Unknown
   * slug → no ids, so the listing is empty rather than unfiltered. */
  private async categoryAndDescendantIds(slug: string): Promise<string[]> {
    const categories = await this.prisma.category.findMany({
      select: { id: true, slug: true, parentId: true },
    });
    const root = categories.find((category) => category.slug === slug);
    if (!root) return [];

    const ids = [root.id];
    for (let index = 0; index < ids.length; index += 1) {
      for (const category of categories) {
        if (category.parentId === ids[index] && !ids.includes(category.id))
          ids.push(category.id);
      }
    }
    return ids;
  }

  /**
   * Published, buyable products with a deal right now, biggest saving (as a
   * share) first. Two kinds count:
   *
   * - a price cut: an offer's time-limited price below its own regular one
   *   (pickSale), saving measured against that regular price;
   * - a best price: an offer at least 5% below every other in-stock seller
   *   of the same variant (withPriceLeads), saving measured against the
   *   runner-up.
   */
  async findDeals(query: DealsQueryDto): Promise<DealsResult> {
    const now = new Date();
    // Variants sold by two or more published offers — the only place a
    // best price can come from. Eligibility and stock are checked properly
    // once the products are read through the public shape.
    const contested = await this.prisma.$queryRaw<{ productId: string }[]>`
      SELECT v.product_id AS "productId"
      FROM offers f
      JOIN product_variants v ON v.id = f.variant_id
      JOIN products p ON p.id = v.product_id
      WHERE f.status::text = ${ProductStatus.PUBLISHED}
        AND v.status::text = ${ProductStatus.PUBLISHED}
        AND p.status::text = ${ProductStatus.PUBLISHED}
      GROUP BY v.id, v.product_id
      HAVING COUNT(*) >= 2
      LIMIT ${DEAL_CANDIDATES}
    `;
    const contestedIds = [...new Set(contested.map((row) => row.productId))];

    const products = await this.prisma.product.findMany({
      where: {
        status: ProductStatus.PUBLISHED,
        OR: [{ id: { in: contestedIds } }, { variants: {
          some: {
            status: ProductStatus.PUBLISHED,
            offers: {
              some: {
                status: ProductStatus.PUBLISHED,
                ...PUBLICLY_ELIGIBLE_OFFER,
                prices: {
                  some: {
                    currency: query.currency,
                    startsAt: { lte: now },
                    endsAt: { gt: now },
                  },
                },
              },
            },
          },
        } }],
      },
      include: PUBLIC_PRODUCT_INCLUDE,
      take: DEAL_CANDIDATES,
    });
    if (products.length === 0) return { items: [] };

    const [stock, ratingSummaries] = await Promise.all([
      this.loadStock(products),
      this.loadRatingSummaries(products),
    ]);

    const ranked = products
      .map((product) => {
        const item = this.toPublicProduct(
          product,
          query.currency,
          stock,
          ratingSummaries.get(product.id),
        );
        let best = 0;
        for (const variant of item.variants)
          for (const offer of variant.offers) {
            if (!offer.currentPrice || !offer.inStock) continue;
            if (offer.compareAtPrice)
              best = Math.max(
                best,
                1 - offer.currentPrice.amount / offer.compareAtPrice.amount,
              );
            if (offer.priceLead)
              best = Math.max(
                best,
                priceLeadShare(offer.currentPrice, offer.priceLead),
              );
          }
        return { item, best };
      })
      .filter((entry) => entry.best > 0)
      .sort((left, right) => right.best - left.best);

    return { items: ranked.slice(0, query.limit).map((entry) => entry.item) };
  }

  /** Features a product on the storefront, or takes it off the shelf. */
  async setFeatured(
    id: string,
    featured: boolean,
  ): Promise<ProductWithRelations> {
    await this.findByIdAdmin(id);
    await this.prisma.product.update({
      where: { id },
      data: { featuredAt: featured ? new Date() : null },
    });
    return this.findByIdAdmin(id);
  }

  /**
   * Available quantity for every offer across a page of products, batched
   * into two queries rather than one per offer.
   *
   * An offer's stock lives in one of two places depending on `stockSource`
   * (see `CartService.previewOfferLine`, which resolves availability the
   * same way for a cart line): a platform-stocked offer shares its variant's
   * inventory record (`offerId: null`), while a seller-stocked offer has its
   * own record keyed by `offerId`.
   */
  private async loadStock(products: ProductRowWithRelations[]): Promise<{
    byVariant: Map<string, number>;
    byOffer: Map<string, number>;
  }> {
    const variantIds: string[] = [];
    const offerIds: string[] = [];

    for (const product of products) {
      for (const variant of product.variants) {
        for (const offer of variant.offers) {
          if (offer.stockSource === OfferStockSource.SELLER) {
            offerIds.push(offer.id);
          } else {
            variantIds.push(variant.id);
          }
        }
      }
    }

    const [byVariant, byOffer] = await Promise.all([
      this.inventory.getAvailableQuantities(variantIds),
      this.inventory.getAvailableOfferQuantities(offerIds),
    ]);

    return { byVariant, byOffer };
  }

  /** Read straight from ProductRatingSummary — never recomputed here, and
   * never created on read: a product with no row yet just has no entry in
   * the returned map, which toPublicProduct treats as all-zero. */
  private async loadRatingSummaries(
    products: { id: string }[],
  ): Promise<Map<string, ProductRatingSummary>> {
    const summaries = await this.prisma.productRatingSummary.findMany({
      where: { productId: { in: products.map((product) => product.id) } },
    });
    return new Map(summaries.map((summary) => [summary.productId, summary]));
  }

  private toPublicProduct(
    product: ProductRowWithRelations,
    currency: string,
    stock: { byVariant: Map<string, number>; byOffer: Map<string, number> },
    ratingSummary: ProductRatingSummary | undefined,
  ): PublicProduct {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      status: product.status,
      isReturnable: product.isReturnable,
      returnWindowDays: product.returnWindowDays,
      brand: product.brand,
      category: product.category,
      // An asset that is still uploading, or has been deleted, has nothing to
      // serve — listing it would only produce a broken image.
      media: product.media
        .filter((media) => media.mediaAsset.status === MediaStatus.AVAILABLE)
        .map((media) => ({
          id: media.id,
          mediaAssetId: media.mediaAssetId,
          position: media.position,
          isPrimary: media.isPrimary,
          mimeType: media.mediaAsset.mimeType,
          url: this.media.createProductDownloadUrl(media.mediaAssetId).url,
        })),
      variants: product.variants.map((variant) => ({
        id: variant.id,
        skuCode: variant.skuCode,
        name: variant.name,
        status: variant.status,
        attributes: variant.attributeValues.map((entry) => ({
          attributeId: entry.attributeValue.attribute.id,
          attributeName: entry.attributeValue.attribute.name,
          valueId: entry.attributeValue.id,
          value: entry.attributeValue.value,
        })),
        offers: withPriceLeads(
          variant.offers.map((offer) => {
            const currentPrice = pickCurrentPrice(offer.prices, currency);
            const sale = pickSale(offer.prices, currency);
            const available =
              offer.stockSource === OfferStockSource.SELLER
                ? (stock.byOffer.get(offer.id) ?? 0)
                : (stock.byVariant.get(variant.id) ?? 0);
            return {
              id: offer.id,
              status: offer.status,
              seller: offer.seller ?? null,
              isFirstParty: offer.sellerId === null,
              currentPrice: currentPrice
                ? { amount: currentPrice.amount, currency: currentPrice.currency }
                : null,
              compareAtPrice: sale
                ? { amount: sale.regular.amount, currency: sale.regular.currency }
                : null,
              saleEndsAt: sale ? sale.endsAt.toISOString() : null,
              // What the offer *is* priced in, so a client can tell "we don't
              // sell this" apart from "we don't sell this in your currency".
              currencies: currentPrices(offer.prices)
                .map((price) => price.currency)
                .sort(),
              inStock: available > 0,
              shippingCost:
                offer.shippingAmount !== null && offer.shippingCurrency !== null
                  ? { amount: offer.shippingAmount, currency: offer.shippingCurrency }
                  : null,
              priceLead: null,
            };
          }),
        ),
      })),
      isFeatured: product.featuredAt !== null,
      averageRating: averageRatingFromSummary(ratingSummary),
      ratingCount: ratingSummary?.ratingCount ?? 0,
      ratingHistogram: ratingHistogramFromSummary(ratingSummary),
    };
  }

  private async deleteUnlessUsed(
    variants: Prisma.ProductVariantWhereInput,
    subject: string,
    remove: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<void> {
    const inUse = new ConflictException(
      `${subject} has order or stock history and can't be deleted. Archive it instead.`,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        const [orderItems, movements] = await Promise.all([
          tx.orderItem.count({ where: { offer: { variant: variants } } }),
          tx.inventoryMovement.count({
            where: { inventoryRecord: { variant: variants } },
          }),
        ]);
        if (orderItems > 0 || movements > 0) throw inUse;

        await remove(tx);
      });
    } catch (error) {
      // Fulfillment lines, purchase-order lines and reviews Restrict the
      // delete at the database — same meaning, same answer.
      if (this.isPrismaError(error, 'P2003')) throw inUse;
      throw error;
    }
  }

  private mapWriteError(error: unknown, conflictMessage: string): unknown {
    if (this.isPrismaError(error, 'P2002')) {
      return new ConflictException(conflictMessage);
    }

    if (this.isPrismaError(error, 'P2003')) {
      return new BadRequestException(
        'One of the referenced ids does not exist',
      );
    }

    return error;
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === code
    );
  }
}
