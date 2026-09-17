import { IsInt } from 'class-validator';

export class CancelReturnDto {
  @IsInt()
  version!: number;
}
