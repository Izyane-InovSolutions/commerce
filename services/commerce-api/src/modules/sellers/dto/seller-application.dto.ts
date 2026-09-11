import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SellerApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Matches(/\S/)
  businessName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/\S/)
  registrationNumber!: string;

  @Matches(/^[A-Z]{2}$/)
  country!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  @Matches(/\S/)
  businessAddress!: string;

  @IsEmail()
  @MaxLength(254)
  contactEmail!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  documentIds!: string[];
}
