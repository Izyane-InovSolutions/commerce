import { IsInt, IsOptional, IsUUID } from 'class-validator';

export class ApproveReturnDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsUUID()
  assignedStaffId?: string;

  @IsInt()
  version!: number;
}
