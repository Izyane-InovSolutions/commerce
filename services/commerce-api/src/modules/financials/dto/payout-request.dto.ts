import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SellerPayoutStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class CreatePayoutRequestDto {
  @IsUUID('4')
  payoutAccountId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  amount!: number;
}

export class CancelPayoutRequestDto {
  @IsString()
  @MaxLength(500)
  reason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}

export class ReviewPayoutRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}

export enum PayoutResolutionOutcome {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export class ResolvePayoutRequestDto {
  @IsEnum(PayoutResolutionOutcome)
  outcome!: PayoutResolutionOutcome;

  @IsString()
  @MaxLength(200)
  providerReference!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}

export class ListPayoutRequestsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SellerPayoutStatus)
  status?: SellerPayoutStatus;

  @IsOptional()
  @IsUUID('4')
  sellerId?: string;
}
