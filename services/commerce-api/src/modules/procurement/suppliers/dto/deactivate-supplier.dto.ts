import { IsInt } from 'class-validator';

export class DeactivateSupplierDto {
  @IsInt()
  version!: number;
}
