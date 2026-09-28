import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Role, type Category } from '@prisma/client';

import { Roles } from '../../../common/auth/roles.decorator';
import { CategoriesService } from './categories.service';
import {
  CategoryAttributesService,
  EffectiveCategoryAttribute,
} from './category-attributes.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { SetCategoryAttributesDto } from './dto/set-category-attributes.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/catalog/categories')
export class AdminCategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly categoryAttributes: CategoryAttributesService,
  ) {}

  @Get()
  findAll(): Promise<Category[]> {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Category> {
    return this.categoriesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.update(id, dto);
  }

  /** Own and inherited attributes, each with `inheritedFrom` (null = own). */
  @Get(':id/attributes')
  findAttributes(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EffectiveCategoryAttribute[]> {
    return this.categoryAttributes.effective(id);
  }

  /** Replaces this category's own attributes; returns the effective list. */
  @Put(':id/attributes')
  setAttributes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCategoryAttributesDto,
  ): Promise<EffectiveCategoryAttribute[]> {
    return this.categoryAttributes.setOwn(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.categoriesService.remove(id);
  }
}
