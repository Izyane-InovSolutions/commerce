import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import { CategoryAttributesService } from './category-attributes.service';

const CATEGORIES: Record<
  string,
  { id: string; name: string; parentId: string | null }
> = {
  electronics: { id: 'electronics', name: 'Electronics', parentId: null },
  phones: { id: 'phones', name: 'Smartphones', parentId: 'electronics' },
};

type Link = {
  categoryId: string;
  attributeId: string;
  isRequired: boolean;
  position: number;
  attribute: {
    id: string;
    code: string;
    name: string;
    values: { id: string; value: string; createdAt: Date }[];
  };
};

type PrismaMock = {
  category: { findUnique: jest.Mock };
  categoryAttribute: {
    findMany: jest.Mock;
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
  attribute: { count: jest.Mock };
  $transaction: jest.Mock;
};

function link(
  categoryId: string,
  attributeId: string,
  isRequired: boolean,
  position = 0,
): Link {
  return {
    categoryId,
    attributeId,
    isRequired,
    position,
    attribute: {
      id: attributeId,
      code: attributeId,
      name: attributeId[0]!.toUpperCase() + attributeId.slice(1),
      values: [{ id: `${attributeId}-1`, value: 'One', createdAt: new Date() }],
    },
  };
}

function buildPrisma(links: Link[]): PrismaMock {
  const prisma: PrismaMock = {
    category: {
      findUnique: jest.fn(({ where }: { where: { id?: string } }) =>
        Promise.resolve(where.id ? (CATEGORIES[where.id] ?? null) : null),
      ),
    },
    categoryAttribute: {
      findMany: jest.fn(() => Promise.resolve(links)),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    attribute: { count: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: PrismaMock) => unknown) => callback(prisma),
  );
  return prisma;
}

describe('CategoryAttributesService', () => {
  it("lists a subcategory's inherited attributes first, then its own", async () => {
    const prisma = buildPrisma([
      link('electronics', 'color', false),
      link('phones', 'storage', true),
    ]);
    const service = new CategoryAttributesService(
      prisma as unknown as PrismaService,
    );

    const effective = await service.effective('phones');

    expect(
      effective.map(({ code, isRequired, inheritedFrom }) => ({
        code,
        isRequired,
        from: inheritedFrom?.name ?? null,
      })),
    ).toEqual([
      { code: 'color', isRequired: false, from: 'Electronics' },
      { code: 'storage', isRequired: true, from: null },
    ]);
  });

  it('lets a subcategory make an inherited attribute required', async () => {
    const prisma = buildPrisma([
      link('electronics', 'color', false),
      link('phones', 'color', true),
    ]);
    const service = new CategoryAttributesService(
      prisma as unknown as PrismaService,
    );

    const [color] = await service.effective('phones');

    expect(color).toMatchObject({ isRequired: true, inheritedFrom: null });
  });

  it('404s for an unknown category', async () => {
    const service = new CategoryAttributesService(
      buildPrisma([]) as unknown as PrismaService,
    );

    await expect(service.effective('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('replaces own attributes in the given order', async () => {
    const prisma = buildPrisma([]);
    prisma.attribute.count.mockResolvedValue(2);
    const service = new CategoryAttributesService(
      prisma as unknown as PrismaService,
    );

    await service.setOwn('phones', {
      attributes: [
        { attributeId: 'storage', isRequired: true },
        { attributeId: 'carrier' },
      ],
    });

    expect(prisma.categoryAttribute.deleteMany).toHaveBeenCalledWith({
      where: { categoryId: 'phones' },
    });
    expect(prisma.categoryAttribute.createMany).toHaveBeenCalledWith({
      data: [
        {
          categoryId: 'phones',
          attributeId: 'storage',
          isRequired: true,
          position: 0,
        },
        {
          categoryId: 'phones',
          attributeId: 'carrier',
          isRequired: false,
          position: 1,
        },
      ],
    });
  });

  it('refuses the same attribute twice and unknown attributes', async () => {
    const prisma = buildPrisma([]);
    prisma.attribute.count.mockResolvedValue(0);
    const service = new CategoryAttributesService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.setOwn('phones', {
        attributes: [{ attributeId: 'color' }, { attributeId: 'color' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setOwn('phones', { attributes: [{ attributeId: 'ghost' }] }),
    ).rejects.toThrow('One of the attributes does not exist');
  });
});
