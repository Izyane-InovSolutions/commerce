import {
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SUPPORTED_CURRENCIES } from '../../../common/catalog/current-price';
import {
  OfferCondition,
  OfferFulfillmentMode,
  OfferStockSource,
  ProductStatus,
} from '@prisma/client';

export class SellerOfferDetailsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  sellerSku!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Matches(/\S/)
  listingTitle!: string;

  @IsEnum(OfferCondition)
  condition!: OfferCondition;

  @IsEnum(OfferStockSource)
  stockSource!: OfferStockSource;

  @IsEnum(OfferFulfillmentMode)
  fulfillmentMode!: OfferFulfillmentMode;
}

export class CreateSellerOfferDto extends SellerOfferDetailsDto {
  @IsUUID('4')
  variantId!: string;
}

export class UpdateSellerOfferDto extends SellerOfferDetailsDto {
  @IsInt()
  @Min(0)
  version!: number;
}

export class SellerOfferStatusDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsEnum(ProductStatus)
  status!: ProductStatus;
}

export class SellerOfferPriceDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  amount!: number;

  @Matches(/^[A-Z]{3}$/)
  @IsString()
  currency!: string;
}
