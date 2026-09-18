import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { SellersService } from '../sellers/sellers.service';
import { ListSellerReturnsDto } from './dto/list-seller-returns.dto';
import {
  SELLER_RETURN_ITEM_INCLUDE,
  projectSellerReturnItem,
} from './seller-return-projection';
import { SellerReturnPage } from './seller-returns.types';

@Injectable()
export class SellerReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellersService: SellersService,
  ) {}

  // Scoped to this seller's own ReturnItem rows only - never the whole
  // ReturnRequest, which can span other sellers (#30).
  async listOwn(
    userId: string,
    query: ListSellerReturnsDto,
  ): Promise<SellerReturnPage> {
    const seller = await this.sellersService.requireApproved(userId);

    const where: Prisma.ReturnItemWhereInput = {
      orderItem: { sellerOrder: { sellerId: seller.id } },
      ...(query.status ? { returnRequest: { status: query.status } } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.returnItem.findMany({
        where,
        include: SELLER_RETURN_ITEM_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.returnItem.count({ where }),
    ]);

    return {
      items: rows.map(projectSellerReturnItem),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
}
