import {
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'code must be uppercase letters, digits, hyphens, or underscores',
  })
  code!: string;

  @IsString()
  @MinLength(1)
  legalName!: string;

  @IsOptional()
  @IsString()
  tradingName?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsObject()
  billingAddress?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  physicalAddress?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'defaultCurrency must be a 3-letter ISO code' })
  defaultCurrency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumOrderAmount?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'minimumOrderCurrency must be a 3-letter ISO code' })
  minimumOrderCurrency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
