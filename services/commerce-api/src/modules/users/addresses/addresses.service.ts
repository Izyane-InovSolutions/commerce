import { Injectable, NotFoundException } from '@nestjs/common';
import type { Address } from '@prisma/client';

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

  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    const existingCount = await this.prisma.address.count({
      where: { userId },
    });

    return this.prisma.address.create({
      data: { ...dto, userId, isDefault: existingCount === 0 },
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    await this.findOne(userId, id);

    return this.prisma.address.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string): Promise<void> {
    const address = await this.findOne(userId, id);

    await this.prisma.address.delete({ where: { id } });

    if (!address.isDefault) {
      return;
    }

    const nextDefault = await this.prisma.address.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    if (nextDefault) {
      await this.prisma.address.update({
        where: { id: nextDefault.id },
        data: { isDefault: true },
      });
    }
  }

  async setDefault(userId: string, id: string): Promise<Address> {
    await this.findOne(userId, id);

    return this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.address.update({ where: { id }, data: { isDefault: true } });
    });
  }
}
