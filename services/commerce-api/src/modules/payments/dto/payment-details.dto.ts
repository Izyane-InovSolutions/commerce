import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CardBillingDto {
  @IsString() @MinLength(1) @MaxLength(100) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(100) lastName!: string;
  @IsString() @MinLength(1) @MaxLength(200) address1!: string;
  @IsString() @MinLength(1) @MaxLength(100) locality!: string;
  @IsString() @MinLength(1) @MaxLength(100) administrativeArea!: string;
  @IsString() @MinLength(1) @MaxLength(20) postalCode!: string;
  @Matches(/^[A-Z]{2}$/) country!: string;
  @IsEmail() @MaxLength(254) email!: string;
}

export class PaymentCardDto {
  @Matches(/^\d{13,19}$/) number!: string;
  @Matches(/^(0[1-9]|1[0-2])$/) expiryMonth!: string;
  @Matches(/^20\d{2}$/) expiryYear!: string;
  @Matches(/^\d{3}$/) securityCode!: string;
  @IsString() @MinLength(1) @MaxLength(150) holderName!: string;
  @IsDefined()
  @ValidateNested()
  @Type(() => CardBillingDto)
  billing!: CardBillingDto;
}

export class PaymentDetailsDto {
  @IsIn(['MOBILE_MONEY', 'CARD']) paymentMethod!: 'MOBILE_MONEY' | 'CARD';
  @ValidateIf((dto: PaymentDetailsDto) => dto.paymentMethod === 'MOBILE_MONEY')
  @Matches(/^(?:0|\+?260)9\d{8}$/)
  phoneNumber?: string;
  @IsOptional() @IsIn(['AIRTEL', 'MTN']) provider?: 'AIRTEL' | 'MTN';
  @ValidateIf((dto: PaymentDetailsDto) => dto.paymentMethod === 'CARD')
  @IsDefined()
  @ValidateNested()
  @Type(() => PaymentCardDto)
  card?: PaymentCardDto;
}
