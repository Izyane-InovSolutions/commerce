import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SupplierProduct } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { CreateSupplierProductDto } from './dto/create-supplier-product.dto';
import { UpdateSupplierProductDto } from './dto/update-supplier-product.dto';
import { SuppliersService } from './suppliers.service';

@Injectable()
export class SupplierProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppliersService: SuppliersService,
  ) {}

  listForSupplier(supplierId: string): Promise<SupplierProduct[]> {
    return this.prisma.supplierProduct.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<SupplierProduct> {
    const product = await this.prisma.supplierProduct.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Supplier product mapping not found');
    }

    return product;
  }

  async create(
    supplierId: string,
    dto: CreateSupplierProductDto,
  ): Promise<SupplierProduct> {
    await this.suppliersService.findById(supplierId);

    try {
      return await this.prisma.supplierProduct.create({
        data: {
          supplierId,
          variantId: dto.variantId,
          supplierSku: dto.supplierSku,
          description: dto.description,
          packSize: dto.packSize,
          minimumOrderQty: dto.minimumOrderQty,
          unitOfMeasure: dto.unitOfMeasure,
          defaultUnitCost: dto.defaultUnitCost,
          lastUnitCost: dto.defaultUnitCost,
          currency: dto.currency,
          leadTimeDays: dto.leadTimeDays,
          isPreferred: dto.isPreferred ?? false,
        },
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async update(
    id: string,
    dto: UpdateSupplierProductDto,
  ): Promise<SupplierProduct> {
    await this.findById(id);

    try {
      return await this.prisma.supplierProduct.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  /**
   * Called by PurchaseOrdersService when a PO line is created without an
   * explicit unit cost, so ordering can pick up the supplier's known price
   * without duplicating the lookup.
   */
  async requireActiveMapping(
    supplierId: string,
    variantId: string,
  ): Promise<SupplierProduct> {
    const mapping = await this.prisma.supplierProduct.findUnique({
      where: { supplierId_variantId: { supplierId, variantId } },
    });

    if (!mapping || !mapping.isActive) {
      throw new NotFoundException(
        'No active supplier product mapping exists for this variant',
      );
    }

    return mapping;
  }

  private mapWriteError(error: unknown): unknown {
    if (this.isPrismaError(error, 'P2002')) {
      return new ConflictException(
        'This supplier already has a mapping for that variant',
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
