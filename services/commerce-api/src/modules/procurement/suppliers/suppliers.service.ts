import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Supplier, SupplierStatus } from '@prisma/client';

import { DEFAULT_CURRENCY } from '../../../common/catalog/current-price';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  PaginationQueryDto,
} from '../../../common/pagination/pagination-query.dto';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

export type SupplierPage = {
  items: Supplier[];
  total: number;
  page: number;
  limit: number;
};

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(
    query: PaginationQueryDto & { status?: SupplierStatus },
  ): Promise<SupplierPage> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const where = query.status ? { status: query.status } : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: { legalName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: string): Promise<Supplier> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return supplier;
  }

  async create(dto: CreateSupplierDto, actorUserId: string): Promise<Supplier> {
    let supplier: Supplier;

    try {
      supplier = await this.prisma.supplier.create({
        data: {
          ...dto,
          defaultCurrency: dto.defaultCurrency ?? DEFAULT_CURRENCY,
          billingAddress: dto.billingAddress as Prisma.InputJsonValue | undefined,
          physicalAddress: dto.physicalAddress as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }

    await this.auditService.record({
      actorUserId,
      action: 'procurement.supplier.created',
      targetType: 'Supplier',
      targetId: supplier.id,
      metadata: { code: supplier.code, legalName: supplier.legalName },
    });

    return supplier;
  }

  async update(
    id: string,
    dto: UpdateSupplierDto,
    actorUserId: string,
  ): Promise<Supplier> {
    const { version, ...data } = dto;

    try {
      const result = await this.prisma.supplier.updateMany({
        where: { id, version },
        data: {
          ...data,
          billingAddress: data.billingAddress as Prisma.InputJsonValue | undefined,
          physicalAddress: data.physicalAddress as Prisma.InputJsonValue | undefined,
          version: { increment: 1 },
        },
      });

      if (result.count !== 1) {
        await this.findById(id);
        throw new ConflictException('Supplier changed; reload and try again');
      }
    } catch (error) {
      throw this.mapWriteError(error);
    }

    const updated = await this.findById(id);

    await this.auditService.record({
      actorUserId,
      action: 'procurement.supplier.updated',
      targetType: 'Supplier',
      targetId: updated.id,
    });

    return updated;
  }

  async deactivate(
    id: string,
    version: number,
    actorUserId: string,
  ): Promise<Supplier> {
    const result = await this.prisma.supplier.updateMany({
      where: { id, version },
      data: { status: SupplierStatus.INACTIVE, version: { increment: 1 } },
    });

    if (result.count !== 1) {
      await this.findById(id);
      throw new ConflictException('Supplier changed; reload and try again');
    }

    const updated = await this.findById(id);

    await this.auditService.record({
      actorUserId,
      action: 'procurement.supplier.deactivated',
      targetType: 'Supplier',
      targetId: updated.id,
    });

    return updated;
  }

  async requireActive(id: string): Promise<Supplier> {
    const supplier = await this.findById(id);

    if (supplier.status !== SupplierStatus.ACTIVE) {
      throw new ConflictException('Supplier is not active');
    }

    return supplier;
  }

  private mapWriteError(error: unknown): unknown {
    if (this.isPrismaError(error, 'P2002')) {
      return new ConflictException('A supplier with this code already exists');
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
