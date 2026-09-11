import {
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateStorefrontDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  storefrontSlug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/\S/)
  displayName!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;
}
