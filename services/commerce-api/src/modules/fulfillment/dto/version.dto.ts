import { IsInt } from 'class-validator';

export class VersionDto {
  @IsInt()
  version!: number;
}
