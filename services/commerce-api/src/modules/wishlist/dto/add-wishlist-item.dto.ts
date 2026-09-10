import { IsUUID } from 'class-validator';

export class AddWishlistItemDto {
  @IsUUID()
  offerId!: string;
}
