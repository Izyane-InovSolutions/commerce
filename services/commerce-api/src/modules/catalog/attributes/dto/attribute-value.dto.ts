import { IsString, MinLength } from 'class-validator';

export class AttributeValueDto {
  @IsString()
  @MinLength(1)
  value!: string;
}
