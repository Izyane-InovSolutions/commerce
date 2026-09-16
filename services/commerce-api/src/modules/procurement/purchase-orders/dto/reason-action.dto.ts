import { IsInt, IsString, MinLength } from 'class-validator';

export class ReasonActionDto {
  @IsInt()
  version!: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}
