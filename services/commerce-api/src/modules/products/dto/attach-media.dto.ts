import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class AttachMediaDto {
  @IsUUID()
  mediaAssetId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
