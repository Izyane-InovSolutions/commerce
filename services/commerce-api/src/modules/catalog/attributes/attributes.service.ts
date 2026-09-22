import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Attribute, AttributeValue, Prisma } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { AttributeValueDto } from './dto/attribute-value.dto';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';

export type AttributeWithValues = Attribute & { values: AttributeValue[] };

@Injectable()
export class AttributesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<AttributeWithValues[]> {
    return this.prisma.attribute.findMany({
      include: { values: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string): Promise<AttributeWithValues> {
    const attribute = await this.prisma.attribute.findUnique({
      where: { id },
      include: { values: true },
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    return attribute;
  }

  async create(dto: CreateAttributeDto): Promise<Attribute> {
    try {
      return await this.prisma.attribute.create({ data: dto });
    } catch (error) {
      throw this.mapWriteError(
        error,
        'An attribute with this code already exists',
      );
    }
  }

  async update(id: string, dto: UpdateAttributeDto): Promise<Attribute> {
    await this.findById(id);

    try {
      return await this.prisma.attribute.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.mapWriteError(
        error,
        'An attribute with this code already exists',
      );
    }
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.attribute.delete({ where: { id } });
  }

  async addValue(
    attributeId: string,
    dto: AttributeValueDto,
  ): Promise<AttributeValue> {
    await this.findById(attributeId);

    try {
      return await this.prisma.attributeValue.create({
        data: { attributeId, value: dto.value },
      });
    } catch (error) {
      throw this.mapWriteError(error, 'This attribute already has that value');
    }
  }

  async updateValue(
    attributeId: string,
    valueId: string,
    dto: AttributeValueDto,
  ): Promise<AttributeValue> {
    await this.findValue(attributeId, valueId);

    try {
      return await this.prisma.attributeValue.update({
        where: { id: valueId },
        data: { value: dto.value },
      });
    } catch (error) {
      throw this.mapWriteError(error, 'This attribute already has that value');
    }
  }

  async removeValue(attributeId: string, valueId: string): Promise<void> {
    await this.findValue(attributeId, valueId);
    await this.prisma.attributeValue.delete({ where: { id: valueId } });
  }

  private async findValue(
    attributeId: string,
    valueId: string,
  ): Promise<AttributeValue> {
    const value = await this.prisma.attributeValue.findUnique({
      where: { id: valueId },
    });

    if (!value || value.attributeId !== attributeId) {
      throw new NotFoundException('Attribute value not found');
    }

    return value;
  }

  private mapWriteError(error: unknown, conflictMessage: string): unknown {
    if (this.isUniqueConstraintError(error)) {
      return new ConflictException(conflictMessage);
    }

    return error;
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
