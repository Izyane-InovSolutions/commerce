import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ShipmentLineDto {
  @IsUUID()
  fulfillmentLineId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateShipmentDto {
  @IsUUID()
  fulfillmentOrderId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShipmentLineDto)
  lines!: ShipmentLineDto[];
}
