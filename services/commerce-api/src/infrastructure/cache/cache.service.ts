import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CacheService {
  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<Prisma.JsonValue | null> {
    const entry = await this.prisma.cacheEntry.findUnique({ where: { key } });

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= new Date()) {
      await this.prisma.cacheEntry.deleteMany({
        where: { key, expiresAt: { lte: new Date() } },
      });
      return null;
    }

    return entry.value;
  }

  async set(
    key: string,
    value: Prisma.InputJsonValue,
    ttlSeconds: number,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);

    await this.prisma.cacheEntry.upsert({
      where: { key },
      create: { key, value, expiresAt },
      update: { value, expiresAt },
    });
  }

  async delete(key: string): Promise<void> {
    await this.prisma.cacheEntry.deleteMany({ where: { key } });
  }

  async deleteExpired(): Promise<number> {
    const result = await this.prisma.cacheEntry.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return result.count;
  }
}
