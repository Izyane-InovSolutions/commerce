import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FulfillmentStatus,
  OfferFulfillmentMode,
  Prisma,
  ShipmentStatus,
} from '@prisma/client';

import type { AddressSnapshot } from '../../common/addresses/address-snapshot';
import { PrismaService } from '../../database/prisma.service';
import {
  SELLER_RETURN_ITEM_INCLUDE,
  projectSellerReturnItem,
} from '../returns/seller-return-projection';
import { SellersService } from '../sellers/sellers.service';
import { projectDestination } from './destination-summary';
import { ListSellerOrdersDto } from './dto/list-seller-orders.dto';
import {
  SellerOrderDetail,
  SellerOrderFulfillmentSummary,
  SellerOrderListItem,
  SellerOrderPage,
  SellerOrderReturnSummary,
  SellerOrderShipmentSummary,
  SellerShipmentDetail,
  SellerShippingGroupDetail,
} from './seller-orders.types';

const LIST_INCLUDE = {
  items: true,
  fulfillmentOrders: {
    include: { shippingGroup: { select: { fulfillmentMode: true } } },
  },
  shipments: { select: { status: true } },
} satisfies Prisma.SellerOrderInclude;

type SellerOrderListRow = Prisma.SellerOrderGetPayload<{
  include: typeof LIST_INCLUDE;
}>;

const DETAIL_INCLUDE = {
  items: true,
  order: { select: { shippingAddress: true } },
  shippingGroups: {
    include: {
      items: true,
      fulfillmentOrders: { include: { lines: true, events: true } },
      shipments: { include: { lines: true, trackingEvents: true } },
    },
  },
} satisfies Prisma.SellerOrderInclude;

type SellerOrderDetailRow = Prisma.SellerOrderGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;

function summarizeShipments(
  shipments: { status: ShipmentStatus }[],
): SellerOrderShipmentSummary {
  const statuses: Partial<Record<ShipmentStatus, number>> = {};
  for (const shipment of shipments) {
    statuses[shipment.status] = (statuses[shipment.status] ?? 0) + 1;
  }
  return { count: shipments.length, statuses };
}

@Injectable()
export class SellerOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellersService: SellersService,
  ) {}

  async listOwn(
    userId: string,
    query: ListSellerOrdersDto,
  ): Promise<SellerOrderPage<SellerOrderListItem>> {
    const seller = await this.sellersService.requireApproved(userId);
    const where: Prisma.SellerOrderWhereInput = {
      sellerId: seller.id,
      ...(query.status ? { status: query.status } : {}),
      // A SellerOrder has at most one seller-mode FulfillmentOrder (partial
      // unique constraint), so filtering on "some" fulfillment order at this
      // status is unambiguous even though platform-mode fulfillment orders
      // can also exist on the same seller order.
      ...(query.fulfillmentStatus
        ? { fulfillmentOrders: { some: { status: query.fulfillmentStatus } } }
        : {}),
      // "Contains a group of this mode," not "every group is this mode" -
      // a seller order can mix SELLER and PLATFORM shipping groups.
      ...(query.fulfillmentMode
        ? {
            shippingGroups: {
              some: { fulfillmentMode: query.fulfillmentMode },
            },
          }
        : {}),
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
      this.prisma.sellerOrder.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.sellerOrder.count({ where }),
    ]);

    const returnCounts = await this.loadReturnCounts(rows.map((row) => row.id));
    const items = rows.map((row) =>
      this.projectListItem(row, returnCounts.get(row.id)),
    );

    return { items, total, page: query.page, limit: query.limit };
  }

  async findOwn(
    userId: string,
    sellerOrderId: string,
  ): Promise<SellerOrderDetail> {
    const seller = await this.sellersService.requireApproved(userId);
    const sellerOrder = await this.prisma.sellerOrder.findUnique({
      where: { id: sellerOrderId },
      include: DETAIL_INCLUDE,
    });

    if (!sellerOrder || sellerOrder.sellerId !== seller.id) {
      throw new NotFoundException('Seller order not found');
    }

    const returnRows = await this.prisma.returnItem.findMany({
      where: { orderItem: { sellerOrderId } },
      include: SELLER_RETURN_ITEM_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return this.projectDetail(
      sellerOrder,
      returnRows.map(projectSellerReturnItem),
    );
  }

  private projectListItem(
    row: SellerOrderListRow,
    returns: SellerOrderReturnSummary | undefined,
  ): SellerOrderListItem {
    const { fulfillmentOrders, shipments, ...rest } = row;
    const projectedFulfillmentOrders: SellerOrderFulfillmentSummary[] =
      fulfillmentOrders.map((fulfillmentOrder) => ({
        id: fulfillmentOrder.id,
        shippingGroupId: fulfillmentOrder.shippingGroupId,
        fulfillmentMode: fulfillmentOrder.shippingGroup.fulfillmentMode,
        status: fulfillmentOrder.status,
        awaitingAcceptance:
          fulfillmentOrder.status === FulfillmentStatus.AWAITING_ACCEPTANCE,
        acceptedAt: fulfillmentOrder.acceptedAt,
      }));

    return {
      ...rest,
      fulfillmentOrders: projectedFulfillmentOrders,
      shipments: summarizeShipments(shipments),
      returns: returns ?? { total: 0, byStatus: {} },
    };
  }

  private projectDetail(
    sellerOrder: SellerOrderDetailRow,
    returns: SellerOrderDetail['returns'],
  ): SellerOrderDetail {
    const { order, shippingGroups, ...rest } = sellerOrder;
    const snapshot = order.shippingAddress as unknown as AddressSnapshot;

    const projectedGroups: SellerShippingGroupDetail[] = shippingGroups.map(
      (group) => ({
        id: group.id,
        fulfillmentMode: group.fulfillmentMode,
        serviceLevel: group.serviceLevel,
        methodName: group.methodName,
        items: group.items,
        // Coarse unless this is the seller's own accepted SELLER-mode
        // fulfillment order; a group can have more than one fulfillment
        // order in principle (multi-warehouse split), so we reveal only if
        // every one of them has been accepted.
        destination: projectDestination(
          snapshot,
          group.fulfillmentMode,
          group.fulfillmentOrders.length > 0 &&
            group.fulfillmentOrders.every((fo) => fo.acceptedAt)
            ? group.fulfillmentOrders[0]!.acceptedAt
            : null,
        ),
        fulfillmentOrders: group.fulfillmentOrders.map((fulfillmentOrder) => ({
          // Defense in depth: never surface an id for a PLATFORM-mode
          // group's fulfillment order, so a client can't construct a
          // mutation URL from a row it has no business acting on.
          id:
            group.fulfillmentMode === OfferFulfillmentMode.SELLER
              ? fulfillmentOrder.id
              : null,
          fulfillmentNumber: fulfillmentOrder.fulfillmentNumber,
          version: fulfillmentOrder.version,
          status: fulfillmentOrder.status,
          awaitingAcceptance:
            fulfillmentOrder.status === FulfillmentStatus.AWAITING_ACCEPTANCE,
          acceptedAt: fulfillmentOrder.acceptedAt,
          heldReason: fulfillmentOrder.heldReason,
          lines: fulfillmentOrder.lines.map((line) => ({
            id: line.id,
            orderItemId: line.orderItemId,
            variantId: line.variantId,
            allocatedQuantity: line.allocatedQuantity,
            pickedQuantity: line.pickedQuantity,
            packedQuantity: line.packedQuantity,
            shipmentAssignedQuantity: line.shipmentAssignedQuantity,
            dispatchedQuantity: line.dispatchedQuantity,
            cancelledQuantity: line.cancelledQuantity,
          })),
          events: fulfillmentOrder.events.map((event) => ({
            type: event.type,
            actorUserId: event.actorUserId,
            metadata: event.metadata,
            createdAt: event.createdAt,
          })),
        })),
        shipments: group.shipments.map(
          (shipment): SellerShipmentDetail => ({
            id: shipment.id,
            shipmentNumber: shipment.shipmentNumber,
            status: shipment.status,
            carrierCode: shipment.carrierCode,
            methodCode: shipment.methodCode,
            trackingReference: shipment.trackingReference,
            estimatedDeliveryAt: shipment.estimatedDeliveryAt,
            dispatchedAt: shipment.dispatchedAt,
            deliveredAt: shipment.deliveredAt,
            cancelledAt: shipment.cancelledAt,
            lines: shipment.lines.map((line) => ({
              orderItemId: line.orderItemId,
              quantity: line.quantity,
            })),
            trackingEvents: shipment.trackingEvents.map((event) => ({
              source: event.source,
              normalizedStatus: event.normalizedStatus,
              description: event.description,
              location: event.location,
              occurredAt: event.occurredAt,
              isCorrection: event.isCorrection,
            })),
          }),
        ),
      }),
    );

    return { ...rest, shippingGroups: projectedGroups, returns };
  }

  private async loadReturnCounts(
    sellerOrderIds: string[],
  ): Promise<Map<string, SellerOrderReturnSummary>> {
    if (sellerOrderIds.length === 0) return new Map();

    const rows = await this.prisma.returnItem.findMany({
      where: { orderItem: { sellerOrderId: { in: sellerOrderIds } } },
      select: {
        orderItem: { select: { sellerOrderId: true } },
        returnRequest: { select: { status: true } },
      },
    });

    const map = new Map<string, SellerOrderReturnSummary>();
    for (const row of rows) {
      const sellerOrderId = row.orderItem.sellerOrderId;
      if (!sellerOrderId) continue;
      const summary = map.get(sellerOrderId) ?? { total: 0, byStatus: {} };
      summary.total += 1;
      summary.byStatus[row.returnRequest.status] =
        (summary.byStatus[row.returnRequest.status] ?? 0) + 1;
      map.set(sellerOrderId, summary);
    }
    return map;
  }
}
