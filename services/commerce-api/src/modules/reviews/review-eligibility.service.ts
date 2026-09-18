import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import {
  computeItemDeliveryCoverage,
  computeSellerOrderCoverage,
  type DeliveredQuantityChunk,
  type ItemCoverage,
} from './review-eligibility';
import type {
  OrderReviewEligibilityView,
  ProductReviewEligibilityView,
  SellerRatingEligibilityView,
} from './reviews.types';

type EligibilityClient = Pick<
  Prisma.TransactionClient,
  'fulfillmentLine' | 'shipmentLine'
>;

@Injectable()
export class ReviewEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /reviews/eligibility?orderId= — the authenticated customer's own order only. */
  async getOrderEligibility(
    userId: string,
    orderId: string,
  ): Promise<OrderReviewEligibilityView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, sellerOrders: true },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    const orderItemIds = order.items.map((item) => item.id);
    const [coverageByItem, existingReviews, existingRatings, ownedSeller] =
      await Promise.all([
        this.loadItemCoverage(this.prisma, order.items),
        this.prisma.productReview.findMany({
          where: { orderItemId: { in: orderItemIds } },
          select: { orderItemId: true },
        }),
        this.prisma.sellerRating.findMany({
          where: { sellerOrderId: { in: order.sellerOrders.map((so) => so.id) } },
          select: { sellerOrderId: true },
        }),
        this.prisma.seller.findUnique({
          where: { ownerUserId: userId },
          select: { id: true },
        }),
      ]);

    const reviewedItemIds = new Set(existingReviews.map((r) => r.orderItemId));
    const ratedSellerOrderIds = new Set(
      existingRatings.map((r) => r.sellerOrderId),
    );

    const products: ProductReviewEligibilityView[] = order.items.map((item) => {
      const coverage = coverageByItem.get(item.id)!;
      const alreadyReviewed = reviewedItemIds.has(item.id);
      return {
        orderItemId: item.id,
        eligible: coverage.eligible && !alreadyReviewed,
        reason: alreadyReviewed
          ? 'A review already exists for this item'
          : coverage.reason,
        alreadyReviewed,
      };
    });

    const sellerOrders: SellerRatingEligibilityView[] = order.sellerOrders
      .filter((sellerOrder) => sellerOrder.sellerId)
      .map((sellerOrder) => {
        const itemsInGroup = order.items.filter(
          (item) => item.sellerOrderId === sellerOrder.id,
        );
        const groupCoverage = computeSellerOrderCoverage(
          itemsInGroup.map((item) => coverageByItem.get(item.id)!),
        );
        const alreadyRated = ratedSellerOrderIds.has(sellerOrder.id);
        const isOwnSeller = ownedSeller?.id === sellerOrder.sellerId;
        let reason = groupCoverage.reason;
        if (alreadyRated) reason = 'A rating already exists for this seller order';
        if (isOwnSeller) reason = 'You cannot rate your own seller account';
        return {
          sellerOrderId: sellerOrder.id,
          sellerId: sellerOrder.sellerId!,
          eligible: groupCoverage.eligible && !alreadyRated && !isOwnSeller,
          reason,
          alreadyRated,
        };
      });

    return { orderId, products, sellerOrders };
  }

  /**
   * Re-run fresh inside the submission transaction — never trusts a prior
   * GET /reviews/eligibility read. Includes the existing-review relation so
   * the caller can reject a duplicate with a clear error before even
   * attempting the create (the DB unique constraint is the backstop for the
   * concurrent race, not the primary check).
   */
  async computeProductEligibilityForSubmission(
    tx: Prisma.TransactionClient,
    userId: string,
    orderItemId: string,
  ): Promise<{
    orderItem: Prisma.OrderItemGetPayload<{
      include: {
        order: true;
        review: true;
        fulfillmentLine: true;
        offer: { include: { variant: { include: { product: true } } } };
      };
    }>;
    coverage: ItemCoverage;
  }> {
    const orderItem = await tx.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        order: true,
        review: true,
        fulfillmentLine: true,
        offer: { include: { variant: { include: { product: true } } } },
      },
    });
    if (!orderItem || orderItem.order.userId !== userId) {
      throw new NotFoundException('Order item not found');
    }
    const coverage = await this.loadSingleItemCoverage(tx, orderItem);
    return { orderItem, coverage };
  }

  async computeSellerEligibilityForSubmission(
    tx: Prisma.TransactionClient,
    userId: string,
    sellerOrderId: string,
  ): Promise<{
    sellerOrder: Prisma.SellerOrderGetPayload<{
      include: {
        order: true;
        rating: true;
        items: { include: { fulfillmentLine: true } };
      };
    }>;
    coverage: ReturnType<typeof computeSellerOrderCoverage>;
    isOwnSeller: boolean;
  }> {
    const sellerOrder = await tx.sellerOrder.findUnique({
      where: { id: sellerOrderId },
      include: {
        order: true,
        rating: true,
        items: { include: { fulfillmentLine: true } },
      },
    });
    if (!sellerOrder || sellerOrder.order.userId !== userId || !sellerOrder.sellerId) {
      throw new NotFoundException('Seller order not found');
    }
    const itemCoverages = await Promise.all(
      sellerOrder.items.map((item) => this.loadSingleItemCoverage(tx, item)),
    );
    const coverage = computeSellerOrderCoverage(itemCoverages);
    const ownedSeller = await tx.seller.findUnique({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    const isOwnSeller = ownedSeller?.id === sellerOrder.sellerId;
    return { sellerOrder, coverage, isOwnSeller };
  }

  private async loadItemCoverage(
    client: EligibilityClient,
    items: { id: string; quantity: number }[],
  ): Promise<Map<string, ItemCoverage>> {
    const orderItemIds = items.map((item) => item.id);
    if (orderItemIds.length === 0) return new Map();

    const [fulfillmentLines, shipmentLines] = await Promise.all([
      client.fulfillmentLine.findMany({
        where: { orderItemId: { in: orderItemIds } },
        select: { orderItemId: true, cancelledQuantity: true },
      }),
      client.shipmentLine.findMany({
        where: { orderItemId: { in: orderItemIds }, shipment: { status: 'DELIVERED' } },
        include: { shipment: { select: { deliveredAt: true } } },
      }),
    ]);

    const cancelledByItem = new Map(
      fulfillmentLines.map((line) => [line.orderItemId, line.cancelledQuantity]),
    );
    const chunksByItem = new Map<string, DeliveredQuantityChunk[]>();
    for (const line of shipmentLines) {
      if (!line.shipment.deliveredAt) continue;
      const list = chunksByItem.get(line.orderItemId) ?? [];
      list.push({ quantity: line.quantity, deliveredAt: line.shipment.deliveredAt });
      chunksByItem.set(line.orderItemId, list);
    }

    const map = new Map<string, ItemCoverage>();
    for (const item of items) {
      map.set(
        item.id,
        computeItemDeliveryCoverage(
          item.quantity,
          cancelledByItem.get(item.id) ?? 0,
          chunksByItem.get(item.id) ?? [],
        ),
      );
    }
    return map;
  }

  private async loadSingleItemCoverage(
    client: EligibilityClient,
    item: {
      id: string;
      quantity: number;
      fulfillmentLine: { cancelledQuantity: number } | null;
    },
  ): Promise<ItemCoverage> {
    const shipmentLines = await client.shipmentLine.findMany({
      where: { orderItemId: item.id, shipment: { status: 'DELIVERED' } },
      include: { shipment: { select: { deliveredAt: true } } },
    });
    const chunks: DeliveredQuantityChunk[] = shipmentLines
      .filter((line) => line.shipment.deliveredAt)
      .map((line) => ({
        quantity: line.quantity,
        deliveredAt: line.shipment.deliveredAt!,
      }));
    return computeItemDeliveryCoverage(
      item.quantity,
      item.fulfillmentLine?.cancelledQuantity ?? 0,
      chunks,
    );
  }
}
