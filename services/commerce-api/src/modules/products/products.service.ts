import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MediaStatus,
  OfferStockSource,
  ProductRatingSummary,
  ProductStatus,
  ProductSubmissionStatus,
  ReviewVisibility,
  SellerStatus,
  type Prisma,
  type ProductVariant,
} from '@prisma/client';

import {
  PaginatedResult,
  paginatedResult,
} from '../../common/pagination/paginated-result';
import { parseSort } from '../../common/pagination/sort.dto';
import { InventoryService } from '../inventory/inventory.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../../database/prisma.service';
import {
  currentPrices,
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
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ReviewProductSubmissionDto } from './dto/review-product-submission.dto';
import { UpdateProductMediaDto } from './dto/update-product-media.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { UpdateStatusDto } from '../../common/catalog/dto/update-status.dto';
import {
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
  ) {}

  async findPublished(
    query: ProductQueryDto,
  ): Promise<PaginatedResult<PublicProduct>> {
    const where = this.buildPublicWhere(query);
    const orderBy = this.buildOrderBy(query.sort);

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
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
        },
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
      include: {
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
      },
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

  async remove(id: string): Promise<void> {
    await this.findByIdAdmin(id);
    await this.prisma.product.delete({ where: { id } });
  }

  async addVariant(
    productId: string,
    dto: CreateVariantDto,
  ): Promise<VariantWithRelations> {
    await this.findByIdAdmin(productId);

    try {
      const variant = await this.prisma.$transaction(async (tx) => {
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
      await this.prisma.$transaction(async (tx) => {
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
      });

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

  async removeVariant(productId: string, variantId: string): Promise<void> {
    await this.findProductVariant(productId, variantId);
    await this.prisma.productVariant.delete({ where: { id: variantId } });
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

  private buildPublicWhere(query: ProductQueryDto): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { status: ProductStatus.PUBLISHED };

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
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
                      displayName: { contains: query.q, mode: 'insensitive' },
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
      ];
    }

    if (query.categorySlug) {
      where.category = { slug: query.categorySlug };
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

  private buildOrderBy(
    sort: string | string[] | undefined,
  ): Prisma.ProductOrderByWithRelationInput[] {
    const sortFields = parseSort(sort);
    const allowedFields = new Set(['name', 'createdAt']);
    const orderBy = sortFields
      .filter((field) => allowedFields.has(field.field))
      .map((field) => ({ [field.field]: field.order }));

    return orderBy.length > 0 ? orderBy : [{ createdAt: 'desc' }];
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
        offers: variant.offers.map((offer) => {
          const currentPrice = pickCurrentPrice(offer.prices, currency);
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
          };
        }),
      })),
      averageRating: averageRatingFromSummary(ratingSummary),
      ratingCount: ratingSummary?.ratingCount ?? 0,
      ratingHistogram: ratingHistogramFromSummary(ratingSummary),
    };
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
