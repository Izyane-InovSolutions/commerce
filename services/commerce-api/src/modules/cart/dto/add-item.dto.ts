import { IsInt, IsUUID, Min } from 'class-validator';

export class AddItemDto {
  @IsUUID()
  offerId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
