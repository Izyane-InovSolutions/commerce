import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import { GoodsReceiptLineDto } from './goods-receipt-line.dto';

export class CreateGoodsReceiptDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  supplierDeliveryNoteRef?: string;

  /** Defaults to true: create and post in one call, the common case. */
  @IsOptional()
  @IsBoolean()
  post?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines!: GoodsReceiptLineDto[];
}
