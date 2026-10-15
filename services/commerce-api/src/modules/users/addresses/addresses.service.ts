import { Injectable, NotFoundException } from '@nestjs/common';
import type { Address, Prisma } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string): Promise<Address> {
    const address = await this.prisma.address.findUnique({ where: { id } });

    if (!address || address.userId !== userId) {
      throw new NotFoundException('Address not found');
    }

    return address;
  }

  private mutate<T>(userId: string, execute: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // A user row exists even before the first address. All promotions and
      // deletions take the same lock, so empty-address races are serialized.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      return execute(tx);
    });
  }

  private async owned(tx: Prisma.TransactionClient, userId: string, id: string): Promise<Address> {
    const address = await tx.address.findFirst({ where: { id, userId } });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  create(userId: string, dto: CreateAddressDto): Promise<Address> {
    return this.mutate(userId, async (tx) => {
      const count = await tx.address.count({ where: { userId } });
      return tx.address.create({ data: { ...dto, userId, isDefault: count === 0 } });
    });
  }

  update(userId: string, id: string, dto: UpdateAddressDto): Promise<Address> {
    return this.mutate(userId, async (tx) => {
      await this.owned(tx, userId, id);
      return tx.address.update({ where: { id }, data: dto });
    });
  }

  remove(userId: string, id: string): Promise<void> {
    return this.mutate(userId, async (tx) => {
      const address = await this.owned(tx, userId, id);
      await tx.address.delete({ where: { id } });
      if (!address.isDefault) return;
      const next = await tx.address.findFirst({
        where: { userId }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    });
  }

  setDefault(userId: string, id: string): Promise<Address> {
    return this.mutate(userId, async (tx) => {
      await this.owned(tx, userId, id);
      await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: { isDefault: true } });
    });
  }
}
