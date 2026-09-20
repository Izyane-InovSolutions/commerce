import { IsNotEmpty, IsString } from 'class-validator';

export class ExchangeHandoffTokenDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
