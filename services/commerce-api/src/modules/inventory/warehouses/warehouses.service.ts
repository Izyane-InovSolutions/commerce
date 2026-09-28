import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Warehouse } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Warehouse[]> {
    return this.prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
  }

  async findById(id: string): Promise<Warehouse> {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    return warehouse;
  }

  async create(dto: CreateWarehouseDto): Promise<Warehouse> {
    try {
      return await this.prisma.warehouse.create({ data: dto });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async update(id: string, dto: UpdateWarehouseDto): Promise<Warehouse> {
    await this.findById(id);

    try {
      return await this.prisma.warehouse.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  /**
   * Only an unused warehouse may be deleted. InventoryRecord's FK cascades,
   * so deleting a stocked warehouse would silently wipe its stock rows and
   * their movement history; that is refused here rather than by changing
   * the FK. The row lock blocks a concurrent insert of a new stock row
   * (its FK check needs a KEY SHARE lock) between the count and the delete.
   * The other document references (purchase orders, goods receipts,
   * fulfillment orders, shipments, return receipts/inspections) are
   * Restrict; that violation surfaces as P2003 and maps to 409 as well.
   */
  async remove(id: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM warehouses WHERE id = ${id}::uuid FOR UPDATE
        `;
        if (!locked) throw new NotFoundException('Warehouse not found');
        const stockRows = await tx.inventoryRecord.count({
          where: { warehouseId: id },
        });
        if (stockRows > 0) {
          throw new ConflictException(
            'Warehouse has inventory records and cannot be deleted; deactivate it instead',
          );
        }
        await tx.warehouse.delete({ where: { id } });
      });
    } catch (error) {
      throw this.mapDeleteError(error);
    }
  }

  private mapWriteError(error: unknown): unknown {
    if (this.isPrismaError(error, 'P2002')) {
      return new ConflictException('A warehouse with this code already exists');
    }

    return error;
  }

  private mapDeleteError(error: unknown): unknown {
    if (this.isPrismaError(error, 'P2003')) {
      return new ConflictException(
        'Warehouse is referenced by purchasing, fulfillment or return records and cannot be deleted; deactivate it instead',
      );
    }

    return error;
  }

  private isPrismaError(
    error: unknown,
    code: string,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === code
    );
  }
}
