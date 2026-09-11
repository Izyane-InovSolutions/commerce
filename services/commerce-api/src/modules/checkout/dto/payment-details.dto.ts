import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CardBillingDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsString()
  address1!: string;

  @IsString()
  locality!: string;

  @IsString()
  administrativeArea!: string;

  @IsString()
  postalCode!: string;

  @Length(2, 2)
  country!: string;

  @IsEmail()
  email!: string;
}

export class CardPaymentDto {
  @IsString()
  number!: string;

  @Length(2, 2)
  expiryMonth!: string;

  @Length(4, 4)
  expiryYear!: string;

  @IsString()
  securityCode!: string;

  @IsString()
  holderName!: string;

  @ValidateNested()
  @Type(() => CardBillingDto)
  billing!: CardBillingDto;
}

export class PaymentDetailsDto {
  @IsIn(['MOBILE_MONEY', 'CARD'])
  paymentMethod!: 'MOBILE_MONEY' | 'CARD';

  @ValidateIf((dto: PaymentDetailsDto) => dto.paymentMethod === 'MOBILE_MONEY')
  @IsString()
  phoneNumber?: string;

  @ValidateIf(
    (dto: PaymentDetailsDto) =>
      dto.paymentMethod === 'MOBILE_MONEY' && dto.provider !== undefined,
  )
  @IsOptional()
  @IsIn(['AIRTEL', 'MTN'])
  provider?: 'AIRTEL' | 'MTN';

  @ValidateIf((dto: PaymentDetailsDto) => dto.paymentMethod === 'CARD')
  @ValidateNested()
  @Type(() => CardPaymentDto)
  card?: CardPaymentDto;
}
