import { IsString, Matches, MinLength } from 'class-validator';

export class CreateAttributeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'code must be a lowercase kebab-case identifier (e.g. "color")',
  })
  code!: string;
}
