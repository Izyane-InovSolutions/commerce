import { Injectable, NotFoundException } from '@nestjs/common';
import type { Address, Prisma } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

/**
 * Invariant: a user with at least one address has exactly one default
 * (backed by the partial unique index addresses_one_default_per_user).
 *
 * The DTOs deliberately carry no `isDefault` (the global ValidationPipe
 * forbids unknown properties, so a client sending it gets a 400). The default
 * therefore changes only through setDefault() or by promotion (when the
 * default is deleted, or when create()/remove() find a legacy user with no
 * default; see ensureDefault), so "unset the only default" is not
 * expressible. create() and update() still never take isDefault from their
 * input; update() cannot change the flag, so it does no repair.
 */
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
    return this.withUserLock(userId, async (tx) => {
      const existingCount = await tx.address.count({ where: { userId } });

      // The first address is the default regardless of input; later ones
      // never are until setDefault() moves it (or a repair promotes it).
      const created = await tx.address.create({
        data: { ...dto, userId, isDefault: existingCount === 0 },
      });
      if (existingCount === 0) {
        return created;
      }

      const promoted = await this.ensureDefault(tx, userId);
      return promoted?.id === created.id ? promoted : created;
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    return this.withUserLock(userId, async (tx) => {
      await this.findOwned(tx, userId, id);

      return tx.address.update({
        where: { id },
        data: { ...dto, isDefault: undefined },
      });
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.withUserLock(userId, async (tx) => {
      await this.findOwned(tx, userId, id);

      await tx.address.delete({ where: { id } });

      // Deleting the default promotes a remaining address. Deleting any other
      // address also repairs a legacy user left with no default.
      await this.ensureDefault(tx, userId);
    });
  }

  async setDefault(userId: string, id: string): Promise<Address> {
    return this.withUserLock(userId, async (tx) => {
      await this.findOwned(tx, userId, id);

      // Unset first: the partial unique index rejects a second default even
      // momentarily within the transaction.
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.address.update({ where: { id }, data: { isDefault: true } });
    });
  }

  // Every address mutation serializes on the users row (it exists before the
  // first address, unlike any address row), so concurrent first-address
  // creates, deletes of the default and setDefault calls cannot leave zero or
  // two defaults. Ownership is checked inside the lock. This is the only lock
  // address mutations take (users is first in the global lock order).
  private withUserLock<T>(
    userId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      return fn(tx);
    });
  }

  // Restores "exactly one default whenever addresses remain" inside the user
  // lock. Users from before the lock existed can have addresses but no
  // default (for example, a default deleted concurrently with the address
  // that should have been promoted); without this they would stay that way,
  // because create() and remove() of a non-default never promote. Promotion
  // is deterministic: most recently updated, id breaks ties. Returns the
  // promoted address, or null when a default exists or nothing remains.
  private async ensureDefault(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<Address | null> {
    const defaults = await tx.address.count({
      where: { userId, isDefault: true },
    });
    if (defaults > 0) {
      return null;
    }

    const nextDefault = await tx.address.findFirst({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    if (!nextDefault) {
      return null;
    }

    return tx.address.update({
      where: { id: nextDefault.id },
      data: { isDefault: true },
    });
  }

  private async findOwned(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ): Promise<Address> {
    const address = await tx.address.findUnique({ where: { id } });

    if (!address || address.userId !== userId) {
      throw new NotFoundException('Address not found');
    }

    return address;
  }
}
