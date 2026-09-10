import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'code must be uppercase letters, digits, hyphens, or underscores',
  })
  code?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
