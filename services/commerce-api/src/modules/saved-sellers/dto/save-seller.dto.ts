import { IsUUID } from 'class-validator';

export class SaveSellerDto {
  @IsUUID()
  sellerId!: string;
}
