import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Brand, Prisma } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Brand[]> {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
  }

  async findBySlug(slug: string): Promise<Brand> {
    const brand = await this.prisma.brand.findUnique({ where: { slug } });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    return brand;
  }

  async findById(id: string): Promise<Brand> {
    const brand = await this.prisma.brand.findUnique({ where: { id } });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    return brand;
  }

  async create(dto: CreateBrandDto): Promise<Brand> {
    try {
      return await this.prisma.brand.create({ data: dto });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async update(id: string, dto: UpdateBrandDto): Promise<Brand> {
    await this.findById(id);

    try {
      return await this.prisma.brand.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.brand.delete({ where: { id } });
  }

  private mapWriteError(error: unknown): unknown {
    if (this.isUniqueConstraintError(error)) {
      return new ConflictException('A brand with this slug already exists');
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
