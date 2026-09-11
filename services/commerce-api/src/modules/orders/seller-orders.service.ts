import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrderItem, SellerOrder } from '@prisma/client';

import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { SellersService } from '../sellers/sellers.service';

export type SellerOrderWithItems = SellerOrder & { items: OrderItem[] };

export type SellerOrderPage<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

@Injectable()
export class SellerOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellersService: SellersService,
  ) {}

  async listOwn(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<SellerOrderPage<SellerOrderWithItems>> {
    const seller = await this.sellersService.requireApproved(userId);
    const where = { sellerId: seller.id };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.sellerOrder.findMany({
        where,
        include: { items: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.sellerOrder.count({ where }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }

  async findOwn(
    userId: string,
    sellerOrderId: string,
  ): Promise<SellerOrderWithItems> {
    const seller = await this.sellersService.requireApproved(userId);
    const sellerOrder = await this.prisma.sellerOrder.findUnique({
      where: { id: sellerOrderId },
      include: { items: true },
    });

    if (!sellerOrder || sellerOrder.sellerId !== seller.id) {
      throw new NotFoundException('Seller order not found');
    }

    return sellerOrder;
  }
}
