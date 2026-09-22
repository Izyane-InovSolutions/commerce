import { IsInt, IsUUID, Min } from 'class-validator';

export class ReceiptLineDto {
  @IsUUID()
  returnItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
