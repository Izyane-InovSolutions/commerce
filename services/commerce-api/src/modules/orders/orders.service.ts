import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OfferStockSource,
  OrderStatus,
  type Order,
  type OrderItem,
  type Prisma,
  type SellerOrder,
} from '@prisma/client';

import { toAddressSnapshot } from '../../common/addresses/address-snapshot';
import { PrismaService } from '../../database/prisma.service';
import { AddressesService } from '../users/addresses/addresses.service';
import { CartLineView } from '../cart/cart.types';
import { CartService } from '../cart/cart.service';
import { LedgerService } from '../financials/ledger.service';
import { InventoryService } from '../inventory/inventory.service';

export type OrderWithItems = Order & {
  items: OrderItem[];
  sellerOrders: (SellerOrder & { items: OrderItem[] })[];
};

type SellerGroup = { sellerId: string | null; items: CartLineView[] };

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly inventoryService: InventoryService,
    private readonly addressesService: AddressesService,
    private readonly ledgerService: LedgerService,
  ) {}

  async createFromCart(
    userId: string,
    shippingAddressId: string,
  ): Promise<OrderWithItems> {
    const cart = await this.cartService.getCartView({ userId });

    if (cart.items.length === 0) {
      throw new ConflictException('Cart is empty');
    }

    if (cart.items.some((item) => !item.isAvailable)) {
      throw new ConflictException(
        'Cart has unavailable items; revalidate the cart before checking out',
      );
    }

    const address = await this.addressesService.findOne(
      userId,
      shippingAddressId,
    );
    const shippingAddress = toAddressSnapshot(address);

    const offers = await this.prisma.offer.findMany({
      where: { id: { in: cart.items.map((item) => item.offerId) } },
    });
    const offerById = new Map(offers.map((offer) => [offer.id, offer]));
    const currency = cart.currency ?? 'USD';
    const groups = this.groupBySeller(cart.items);

    const createdOrderId = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING_PAYMENT,
          currency,
          subtotal: cart.subtotal,
          total: cart.subtotal,
          shippingAddress: shippingAddress as unknown as Prisma.InputJsonValue,
        },
      });

      for (const group of groups) {
        const groupSubtotal = group.items.reduce(
          (sum, item) => sum + item.lineTotal,
          0,
        );

        await tx.sellerOrder.create({
          data: {
            orderId: order.id,
            sellerId: group.sellerId,
            status: OrderStatus.PENDING_PAYMENT,
            currency,
            subtotal: groupSubtotal,
            total: groupSubtotal,
            items: {
              create: group.items.map((item) => ({
                orderId: order.id,
                offerId: item.offerId,
                quantity: item.quantity,
                unitAmount: item.unitPrice?.amount ?? 0,
                currency: item.unitPrice?.currency ?? currency,
                lineTotal: item.lineTotal,
              })),
            },
          },
        });
      }

      return order.id;
    });

    const created = await this.findByIdOrThrow(createdOrderId);
    const reservedItemIds: string[] = [];

    for (const item of created.items) {
      const offer = offerById.get(item.offerId);

      if (!offer) {
        await this.compensate(createdOrderId, reservedItemIds);
        throw new ConflictException('Offer is no longer available');
      }

      // SELLER-stockSource offers have no backing inventory model yet
      // (#33's job) - nothing to reserve, so leave reservationId unset.
      if (offer.stockSource !== OfferStockSource.PLATFORM) {
        continue;
      }

      try {
        const reservation = await this.inventoryService.reserve(
          offer.variantId,
          item.quantity,
          {
            holderType: 'order_item',
            holderId: item.id,
          },
        );
        await this.prisma.orderItem.update({
          where: { id: item.id },
          data: { reservationId: reservation.id },
        });
        reservedItemIds.push(item.id);
      } catch (error) {
        await this.compensate(createdOrderId, reservedItemIds);
        throw error;
      }
    }

    return this.findByIdOrThrow(createdOrderId);
  }

  async confirmPayment(orderId: string): Promise<Order> {
    const order = await this.findByIdOrThrow(orderId);

    for (const item of order.items) {
      if (item.reservationId) {
        await this.inventoryService.commit(item.reservationId);
      }
    }

    await this.prisma.sellerOrder.updateMany({
      where: { orderId },
      data: { status: OrderStatus.PAID },
    });

    for (const sellerOrder of order.sellerOrders) {
      await this.ledgerService.recordSale(sellerOrder);
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID },
    });
  }

  async getSellerOrderForPayment(sellerOrderId: string): Promise<SellerOrder> {
    const sellerOrder = await this.prisma.sellerOrder.findUnique({
      where: { id: sellerOrderId },
    });

    if (!sellerOrder) {
      throw new NotFoundException('Seller order not found');
    }

    if (
      sellerOrder.status !== OrderStatus.PAID &&
      sellerOrder.status !== OrderStatus.PARTIALLY_REFUNDED
    ) {
      throw new ConflictException(
        'Only a paid or partially-refunded seller order can be refunded',
      );
    }

    return sellerOrder;
  }

  async applyRefund(
    sellerOrderId: string,
    amount: number,
  ): Promise<SellerOrder> {
    const sellerOrder = await this.prisma.sellerOrder.findUnique({
      where: { id: sellerOrderId },
      include: { items: true },
    });

    if (!sellerOrder) {
      throw new NotFoundException('Seller order not found');
    }

    const remaining = sellerOrder.total - sellerOrder.refundedAmount;

    if (amount > remaining) {
      throw new ConflictException(
        'Refund amount exceeds the remaining refundable balance for this seller order',
      );
    }

    const refundedAmount = sellerOrder.refundedAmount + amount;
    const fullyRefunded = refundedAmount >= sellerOrder.total;

    const updated = await this.prisma.sellerOrder.update({
      where: { id: sellerOrderId },
      data: {
        refundedAmount,
        status: fullyRefunded
          ? OrderStatus.REFUNDED
          : OrderStatus.PARTIALLY_REFUNDED,
      },
    });

    if (fullyRefunded) {
      for (const item of sellerOrder.items) {
        if (item.reservationId) {
          await this.inventoryService.restock(item.reservationId);
        }
      }
    }

    return updated;
  }

  async cancel(orderId: string): Promise<Order> {
    const order = await this.findByIdOrThrow(orderId);

    for (const item of order.items) {
      if (item.reservationId) {
        await this.inventoryService.release(item.reservationId);
      }
    }

    await this.prisma.sellerOrder.updateMany({
      where: { orderId },
      data: { status: OrderStatus.CANCELLED },
    });

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  }

  listOwn(userId: string): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: true, sellerOrders: { include: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOwn(userId: string, orderId: string): Promise<OrderWithItems> {
    const order = await this.findByIdOrThrow(orderId);

    if (order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  // sellerId: null is the platform/first-party group - every order gets at
  // least one group, even a purely first-party one, so callers never have to
  // branch on whether splitting happened.
  private groupBySeller(items: CartLineView[]): SellerGroup[] {
    const groups = new Map<string | null, CartLineView[]>();

    for (const item of items) {
      const existing = groups.get(item.sellerId);

      if (existing) {
        existing.push(item);
      } else {
        groups.set(item.sellerId, [item]);
      }
    }

    return [...groups.entries()].map(([sellerId, groupItems]) => ({
      sellerId,
      items: groupItems,
    }));
  }

  private async compensate(
    orderId: string,
    reservedItemIds: string[],
  ): Promise<void> {
    for (const itemId of reservedItemIds) {
      const item = await this.prisma.orderItem.findUnique({
        where: { id: itemId },
      });

      if (item?.reservationId) {
        await this.inventoryService.release(item.reservationId);
      }
    }

    await this.prisma.sellerOrder.updateMany({
      where: { orderId },
      data: { status: OrderStatus.CANCELLED },
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  }

  private async findByIdOrThrow(orderId: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, sellerOrders: { include: { items: true } } },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }
}
