import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsIn, IsString, MaxLength, Min } from 'class-validator';

export const ALLOWED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export class ReserveUploadDto {
  @ApiProperty({ example: 'product.jpg' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ enum: ALLOWED_MEDIA_TYPES })
  @IsIn(ALLOWED_MEDIA_TYPES)
  mimeType!: string;

  @ApiProperty({ example: 102400 })
  @IsInt()
  @Min(1)
  byteSize!: number;
}
