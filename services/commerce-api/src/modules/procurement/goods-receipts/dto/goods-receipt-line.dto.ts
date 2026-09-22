import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class GoodsReceiptLineDto {
  @IsUUID()
  purchaseOrderLineId!: string;

  @IsInt()
  @Min(0)
  deliveredQuantity!: number;

  @IsInt()
  @Min(0)
  acceptedQuantity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rejectedQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  damagedQuantity?: number;

  /** Non-zero only permitted for an ADMIN, enforced in the service. */
  @IsOptional()
  @IsInt()
  @Min(0)
  authorizedExcessQty?: number;

  @IsOptional()
  @IsString()
  discrepancyReason?: string;
}
