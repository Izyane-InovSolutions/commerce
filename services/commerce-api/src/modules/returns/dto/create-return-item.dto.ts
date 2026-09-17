import { ReturnReasonCode } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateReturnItemDto {
  @IsUUID()
  orderItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsEnum(ReturnReasonCode)
  reasonCode!: ReturnReasonCode;

  @IsOptional()
  @IsString()
  note?: string;
}
