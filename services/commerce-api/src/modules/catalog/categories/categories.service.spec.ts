import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let prisma: {
    category: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let service: CategoriesService;

  beforeEach(() => {
    prisma = {
      category: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new CategoriesService(prisma as unknown as PrismaService);
  });

  it('throws not found when the category does not exist', async () => {
    prisma.category.findUnique.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps a unique constraint violation on create to a conflict', async () => {
    prisma.category.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create({ name: 'Shoes', slug: 'shoes' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects setting a category as its own parent', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });

    await expect(
      service.update('cat-1', { parentId: 'cat-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects reparenting a category under its own descendant', async () => {
    // cat-1 -> cat-2 -> cat-3; trying to set cat-1's parent to cat-3 is a cycle.
    prisma.category.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) => {
        const rows: Record<string, { id: string; parentId: string | null }> = {
          'cat-1': { id: 'cat-1', parentId: null },
          'cat-3': { id: 'cat-3', parentId: 'cat-2' },
          'cat-2': { id: 'cat-2', parentId: 'cat-1' },
        };
        return Promise.resolve(rows[where.id] ?? null);
      },
    );

    await expect(
      service.update('cat-1', { parentId: 'cat-3' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows reparenting to an unrelated category', async () => {
    prisma.category.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) => {
        const rows: Record<string, { id: string; parentId: string | null }> = {
          'cat-1': { id: 'cat-1', parentId: null },
          'cat-9': { id: 'cat-9', parentId: null },
        };
        return Promise.resolve(rows[where.id] ?? null);
      },
    );
    prisma.category.update.mockResolvedValue({
      id: 'cat-1',
      parentId: 'cat-9',
    });

    await expect(
      service.update('cat-1', { parentId: 'cat-9' }),
    ).resolves.toEqual({ id: 'cat-1', parentId: 'cat-9' });
  });
});
