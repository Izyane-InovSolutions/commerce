import { IsString, MinLength } from 'class-validator';

export class ReverseGoodsReceiptDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
