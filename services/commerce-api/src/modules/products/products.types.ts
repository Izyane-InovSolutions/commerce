import type {
  Attribute,
  AttributeValue,
  Brand,
  Category,
  MediaAsset,
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

export type ProductMediaWithAsset = ProductMedia & { mediaAsset: MediaAsset };

export type ProductWithRelations = Product & {
  brand: Brand | null;
  category: Category | null;
  variants: VariantWithRelations[];
  media: ProductMediaWithAsset[];
};

export type PublicOffer = {
  id: string;
  status: Offer['status'];
  currentPrice: { amount: number; currency: string } | null;
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
  brand: Brand | null;
  category: Category | null;
  media: {
    id: string;
    mediaAssetId: string;
    position: number;
    isPrimary: boolean;
  }[];
  variants: PublicVariant[];
};
