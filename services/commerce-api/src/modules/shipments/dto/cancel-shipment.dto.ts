import { IsString, MinLength } from 'class-validator';

export class CancelShipmentDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
