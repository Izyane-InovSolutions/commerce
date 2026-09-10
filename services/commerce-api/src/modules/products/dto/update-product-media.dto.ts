import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateProductMediaDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
