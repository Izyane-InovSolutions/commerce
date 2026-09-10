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
} from '@nestjs/common';
import { Role, type Attribute, type AttributeValue } from '@prisma/client';

import { Roles } from '../../../common/auth/roles.decorator';
import { AttributesService, AttributeWithValues } from './attributes.service';
import { AttributeValueDto } from './dto/attribute-value.dto';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/catalog/attributes')
export class AdminAttributesController {
  constructor(private readonly attributesService: AttributesService) {}

  @Get()
  findAll(): Promise<AttributeWithValues[]> {
    return this.attributesService.findAll();
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AttributeWithValues> {
    return this.attributesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateAttributeDto): Promise<Attribute> {
    return this.attributesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttributeDto,
  ): Promise<Attribute> {
    return this.attributesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.attributesService.remove(id);
  }

  @Post(':id/values')
  addValue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttributeValueDto,
  ): Promise<AttributeValue> {
    return this.attributesService.addValue(id, dto);
  }

  @Patch(':id/values/:valueId')
  updateValue(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('valueId', ParseUUIDPipe) valueId: string,
    @Body() dto: AttributeValueDto,
  ): Promise<AttributeValue> {
    return this.attributesService.updateValue(id, valueId, dto);
  }

  @Delete(':id/values/:valueId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeValue(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('valueId', ParseUUIDPipe) valueId: string,
  ): Promise<void> {
    return this.attributesService.removeValue(id, valueId);
  }
}
