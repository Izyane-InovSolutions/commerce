import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PayoutAccountMethod, PayoutAccountStatus } from '@prisma/client';

export class SavePayoutAccountDto {
  @IsEnum(PayoutAccountMethod)
  method!: PayoutAccountMethod;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  accountHolderName!: string;

  @IsObject()
  destination!: Record<string, unknown>;
}

export class UpdatePayoutAccountDto extends SavePayoutAccountDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}

export class VerifyPayoutAccountDto {
  @IsEnum(PayoutAccountStatus)
  status!: PayoutAccountStatus;

  @IsString()
  @MaxLength(500)
  note!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}

export class PayoutAccountVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}
