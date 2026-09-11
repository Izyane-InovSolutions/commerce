import { IsEnum } from 'class-validator';
import { ProductStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(ProductStatus)
  status!: ProductStatus;
}
