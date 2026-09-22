import { ReturnDisposition } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class InspectionLineDto {
  @IsUUID()
  returnItemId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsInt()
  @Min(0)
  acceptedQuantity!: number;

  @IsOptional()
  @IsEnum(ReturnDisposition)
  disposition?: ReturnDisposition;

  @IsInt()
  @Min(0)
  rejectedQuantity!: number;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
