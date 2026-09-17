import { IsInt, IsString, MinLength } from 'class-validator';

export class RejectReturnDto {
  @IsString()
  @MinLength(1)
  rejectionReason!: string;

  @IsInt()
  version!: number;
}
