import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CancelLineDto {
  @IsUUID()
  fulfillmentLineId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CancelLinesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CancelLineDto)
  lines!: CancelLineDto[];

  @IsString()
  @MinLength(1)
  reason!: string;
}
