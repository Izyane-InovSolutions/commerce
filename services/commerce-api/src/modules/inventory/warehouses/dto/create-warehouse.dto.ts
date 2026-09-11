import { IsString, Matches, MinLength } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'code must be uppercase letters, digits, hyphens, or underscores',
  })
  code!: string;
}
