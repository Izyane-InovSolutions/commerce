import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Category, Prisma } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Category[]> {
    return this.prisma.category.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: { children: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async findById(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentId) {
      await this.findById(dto.parentId);
    }

    try {
      return await this.prisma.category.create({ data: dto });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.findById(id);

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }

      await this.findById(dto.parentId);
      await this.assertNotDescendant(id, dto.parentId);
    }

    try {
      return await this.prisma.category.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.category.delete({ where: { id } });
  }

  // Prevents creating a cycle: the new parent must not be `id` itself or any
  // of its descendants.
  private async assertNotDescendant(
    id: string,
    candidateParentId: string,
  ): Promise<void> {
    let current: string | null = candidateParentId;

    while (current) {
      if (current === id) {
        throw new BadRequestException(
          'A category cannot be reparented under one of its own descendants',
        );
      }

      const parent: { parentId: string | null } | null =
        await this.prisma.category.findUnique({
          where: { id: current },
          select: { parentId: true },
        });
      current = parent?.parentId ?? null;
    }
  }

  private mapWriteError(error: unknown): unknown {
    if (this.isUniqueConstraintError(error)) {
      return new ConflictException('A category with this slug already exists');
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
