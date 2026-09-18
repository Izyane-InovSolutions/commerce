import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { QuantityLineDto } from './quantity-line.dto';

export class SellerDispatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuantityLineDto)
  lines!: QuantityLineDto[];

  @IsString()
  @MinLength(1)
  carrierCode!: string;

  @IsOptional()
  @IsString()
  trackingReference?: string;

  @IsOptional()
  @IsDateString()
  estimatedDeliveryAt?: string;
}
