import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MediaStatus,
  ProductStatus,
  type Prisma,
  type ProductVariant,
} from '@prisma/client';

import {
  PaginatedResult,
  paginatedResult,
} from '../../common/pagination/paginated-result';
import { parseSort } from '../../common/pagination/sort.dto';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../../database/prisma.service';
import {
  currentPrices,
  pickCurrentPrice,
} from '../../common/catalog/current-price';
import { AttachMediaDto } from './dto/attach-media.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductMediaDto } from './dto/update-product-media.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { UpdateStatusDto } from '../../common/catalog/dto/update-status.dto';
import {
  ProductRowWithRelations,
  ProductWithRelations,
  PublicProduct,
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
                where: { status: ProductStatus.PUBLISHED, sellerId: null },
                include: { prices: true },
              },
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginatedResult(
      products.map((product) => this.toPublicProduct(product, query.currency)),
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
              where: { status: ProductStatus.PUBLISHED, sellerId: null },
              include: { prices: true },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.toPublicProduct(product, currency);
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

  private toPublicProduct(
    product: ProductRowWithRelations,
    currency: string,
  ): PublicProduct {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      status: product.status,
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
          return {
            id: offer.id,
            status: offer.status,
            currentPrice: currentPrice
              ? { amount: currentPrice.amount, currency: currentPrice.currency }
              : null,
            // What the offer *is* priced in, so a client can tell "we don't
            // sell this" apart from "we don't sell this in your currency".
            currencies: currentPrices(offer.prices)
              .map((price) => price.currency)
              .sort(),
          };
        }),
      })),
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
