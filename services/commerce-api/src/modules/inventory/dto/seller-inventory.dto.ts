import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SetSellerInventoryDto {
  @IsInt()
  @Min(0)
  @Max(2147483647)
  quantity!: number;

  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BulkSellerInventoryItemDto extends SetSellerInventoryDto {
  @IsUUID('4')
  offerId!: string;
}

export class BulkSellerInventoryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BulkSellerInventoryItemDto)
  items!: BulkSellerInventoryItemDto[];
}
