import {
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';

export class ReviewSellerDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  @Matches(/\S/)
  reason!: string;
}
