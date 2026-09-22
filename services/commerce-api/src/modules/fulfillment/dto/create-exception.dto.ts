import { FulfillmentExceptionType } from '@prisma/client';
import { IsEnum, IsInt, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateExceptionDto {
  @IsUUID()
  fulfillmentLineId!: string;

  @IsEnum(FulfillmentExceptionType)
  type!: FulfillmentExceptionType;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}
