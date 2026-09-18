import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';

import { ShippingRefundDto } from './shipping-refund.dto';

export class FinalizeInspectionDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShippingRefundDto)
  shippingRefunds?: ShippingRefundDto[];
}
