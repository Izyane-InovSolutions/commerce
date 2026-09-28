import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CategoryAttributeEntryDto {
  @IsUUID()
  attributeId!: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class SetCategoryAttributesDto {
  /** In picker order. An empty list detaches everything from this category
   * (its ancestors' attributes still apply). */
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CategoryAttributeEntryDto)
  attributes!: CategoryAttributeEntryDto[];
}
