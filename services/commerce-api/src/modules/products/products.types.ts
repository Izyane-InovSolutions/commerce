import type {
  Attribute,
  AttributeValue,
  Brand,
  Category,
  MediaStatus,
  Offer,
  Price,
  Product,
  ProductMedia,
  ProductVariant,
  ProductVariantAttributeValue,
} from '@prisma/client';

export type VariantAttributeValueWithDetail = ProductVariantAttributeValue & {
  attributeValue: AttributeValue & { attribute: Attribute };
};

export type OfferWithPrices = Offer & { prices: Price[] };

export type VariantWithRelations = ProductVariant & {
  attributeValues: VariantAttributeValueWithDetail[];
  offers: OfferWithPrices[];
};

/**
 * The part of a media asset a catalog response carries.
 *
 * Deliberately not the whole row: `byteSize` is a BigInt that JSON cannot
 * serialise, and `storageKey` and `ownerUserId` are internal to the media
 * module rather than something a catalog client should see.
 */
export type ProductMediaAsset = {
  id: string;
  mimeType: string;
  originalFileName: string;
  status: MediaStatus;
};

export type ProductMediaWithAsset = ProductMedia & {
  mediaAsset: ProductMediaAsset;
};

export type AdminProductMedia = ProductMediaWithAsset & {
  /**
   * Signed, and relative to the API's own origin. Null while the asset is
   * still reserved: there are no bytes to serve until the upload lands.
   */
  url: string | null;
};

/** A product as it comes back from the database. */
export type ProductRowWithRelations = Product & {
  brand: Brand | null;
  category: Category | null;
  variants: VariantWithRelations[];
  media: ProductMediaWithAsset[];
};

/** A product as the admin catalog returns it, with its images viewable. */
export type ProductWithRelations = Omit<ProductRowWithRelations, 'media'> & {
  media: AdminProductMedia[];
};

export type PublicOffer = {
  id: string;
  status: Offer['status'];
  /** Resolved in the requested currency; null when it has no price in it. */
  currentPrice: { amount: number; currency: string } | null;
  /** Every currency this offer currently carries a price in. */
  currencies: string[];
};

export type PublicVariant = {
  id: string;
  skuCode: string;
  name: string | null;
  status: ProductVariant['status'];
  attributes: {
    attributeId: string;
    attributeName: string;
    valueId: string;
    value: string;
  }[];
  offers: PublicOffer[];
};

export type PublicProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: Product['status'];
  isReturnable: boolean;
  returnWindowDays: number | null;
  brand: Brand | null;
  category: Category | null;
  media: {
    id: string;
    mediaAssetId: string;
    position: number;
    isPrimary: boolean;
    mimeType: string;
    /** Signed, and relative to the API's own origin. */
    url: string;
  }[];
  variants: PublicVariant[];
};
