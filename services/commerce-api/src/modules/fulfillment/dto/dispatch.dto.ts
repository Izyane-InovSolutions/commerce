import { IsUUID } from 'class-validator';

export class DispatchDto {
  @IsUUID()
  shipmentId!: string;
}
