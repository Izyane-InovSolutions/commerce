import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';

import { InspectionLineDto } from './inspection-line.dto';
import { ShippingRefundDto } from './shipping-refund.dto';

export class PostInspectionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InspectionLineDto)
  lines!: InspectionLineDto[];

  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;

  // Only consulted when isFinal is true; excluded (0) for a seller order
  // group unless the admin explicitly supplies it here.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShippingRefundDto)
  shippingRefunds?: ShippingRefundDto[];
}
