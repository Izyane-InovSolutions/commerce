import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import { ReceiptLineDto } from './receipt-line.dto';

export class PostReceiptDto {
  @IsUUID()
  warehouseId!: string;

  // May be empty only on a closing receipt (enforced by ReturnsService).
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];

  @IsOptional()
  @IsBoolean()
  isClosing?: boolean;
}
