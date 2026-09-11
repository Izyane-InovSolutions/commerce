import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PaymentReasonDto {
  @IsString() @MinLength(3) @MaxLength(500) @Matches(/\S/) reason!: string;
}

export class RefundPaymentDto extends PaymentReasonDto {
  // The local API uses minor units, as do all commerce prices.
  @IsInt() @Min(1) @Max(2147483647) amount!: number;
}

export class GatewayPaymentQueryDto {
  @Type(() => Number) @IsInt() @Min(0) page = 0;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) size = 25;
  @IsIn(['createdAt']) sortBy = 'createdAt';
  @Type(() => String) @IsIn(['true', 'false']) descending = 'true';
}
