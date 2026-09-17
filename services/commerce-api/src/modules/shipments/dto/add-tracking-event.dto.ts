import { ShipmentStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class AddTrackingEventDto {
  @IsEnum(ShipmentStatus)
  normalizedStatus!: ShipmentStatus;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsBoolean()
  isCorrection?: boolean;

  @ValidateIf((dto: AddTrackingEventDto) => dto.isCorrection === true)
  @IsString()
  @MinLength(1)
  correctionReason?: string;
}
