import { IsNotEmpty, MinLength } from 'class-validator';

export class ConfirmPasswordResetDto {
  @IsNotEmpty()
  token!: string;

  @MinLength(8)
  newPassword!: string;
}
