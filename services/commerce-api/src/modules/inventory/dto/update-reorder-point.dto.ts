import { IsInt, Min } from 'class-validator';

export class UpdateReorderPointDto {
  @IsInt()
  @Min(0)
  reorderPoint!: number;
}
