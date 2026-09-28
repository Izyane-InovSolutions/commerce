import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { SetCategoryAttributesDto } from './dto/set-category-attributes.dto';

type Client = Pick<
  Prisma.TransactionClient,
  'category' | 'categoryAttribute' | 'attribute'
>;

/** One attribute as it applies to a category, after inheritance. */
export type EffectiveCategoryAttribute = {
  attributeId: string;
  code: string;
  name: string;
  isRequired: boolean;
  /** Null when attached to this category itself; otherwise the ancestor it
   * comes from. */
  inheritedFrom: { id: string; name: string } | null;
  values: { id: string; value: string }[];
};

@Injectable()
export class CategoryAttributesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The attributes products in `categoryId` are described by: every
   * ancestor's, root first, then the category's own.
   *
   * Attaching an attribute an ancestor already has doesn't add a second row —
   * it overrides `isRequired` for this branch (so "Carrier" can be optional
   * under Electronics but required under Phones) and keeps the ancestor's
   * place in the order.
   */
  async effective(
    categoryId: string,
    client: Client = this.prisma,
  ): Promise<EffectiveCategoryAttribute[]> {
    const chain = await this.ancestry(categoryId, client);
    const links = await client.categoryAttribute.findMany({
      where: { categoryId: { in: chain.map((category) => category.id) } },
      include: {
        attribute: {
          include: { values: { orderBy: { createdAt: 'asc' } } },
        },
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    const byAttribute = new Map<string, EffectiveCategoryAttribute>();
    for (const category of chain) {
      for (const link of links.filter(
        (row) => row.categoryId === category.id,
      )) {
        const inheritedFrom =
          category.id === categoryId
            ? null
            : { id: category.id, name: category.name };
        const existing = byAttribute.get(link.attributeId);
        if (existing) {
          existing.isRequired = link.isRequired;
          existing.inheritedFrom = inheritedFrom;
          continue;
        }
        byAttribute.set(link.attributeId, {
          attributeId: link.attributeId,
          code: link.attribute.code,
          name: link.attribute.name,
          isRequired: link.isRequired,
          inheritedFrom,
          values: link.attribute.values.map(({ id, value }) => ({ id, value })),
        });
      }
    }
    return [...byAttribute.values()];
  }

  async effectiveBySlug(slug: string): Promise<EffectiveCategoryAttribute[]> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    return this.effective(category.id);
  }

  /**
   * Replaces the attributes attached to this category itself (inherited ones
   * are managed on the ancestor). List order becomes picker order.
   *
   * Existing variants aren't re-checked: the rules apply the next time a
   * variant is created or its attributes are changed.
   */
  async setOwn(
    categoryId: string,
    dto: SetCategoryAttributesDto,
  ): Promise<EffectiveCategoryAttribute[]> {
    const ids = dto.attributes.map((entry) => entry.attributeId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Each attribute can be attached only once');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.requireCategory(categoryId, tx);
      const found = await tx.attribute.count({ where: { id: { in: ids } } });
      if (found !== ids.length) {
        throw new BadRequestException('One of the attributes does not exist');
      }

      await tx.categoryAttribute.deleteMany({ where: { categoryId } });
      if (ids.length > 0) {
        await tx.categoryAttribute.createMany({
          data: dto.attributes.map((entry, position) => ({
            categoryId,
            attributeId: entry.attributeId,
            isRequired: entry.isRequired ?? false,
            position,
          })),
        });
      }
    });

    return this.effective(categoryId);
  }

  /** The category and its ancestors, root first. */
  private async ancestry(
    categoryId: string,
    client: Client,
  ): Promise<{ id: string; name: string }[]> {
    const chain: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    let current: string | null = categoryId;

    // Reparenting already refuses cycles; `seen` just keeps a corrupt row
    // from looping forever.
    while (current && !seen.has(current)) {
      seen.add(current);
      const category: {
        id: string;
        name: string;
        parentId: string | null;
      } | null = await client.category.findUnique({
        where: { id: current },
        select: { id: true, name: true, parentId: true },
      });
      if (!category) {
        if (current === categoryId)
          throw new NotFoundException('Category not found');
        break;
      }
      chain.unshift({ id: category.id, name: category.name });
      current = category.parentId;
    }
    return chain;
  }

  private async requireCategory(id: string, client: Client): Promise<void> {
    const category = await client.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');
  }
}
