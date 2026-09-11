import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  type Order,
  type OrderItem,
  type Prisma,
} from '@prisma/client';

import { toAddressSnapshot } from '../../common/addresses/address-snapshot';
import { PrismaService } from '../../database/prisma.service';
import { AddressesService } from '../users/addresses/addresses.service';
import { CartService } from '../cart/cart.service';
import { InventoryService } from '../inventory/inventory.service';

export type OrderWithItems = Order & { items: OrderItem[] };

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly inventoryService: InventoryService,
    private readonly addressesService: AddressesService,
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
    if (offers.some((offer) => offer.sellerId))
      throw new ConflictException(
        'Seller checkout requires seller inventory and order splitting',
      );
    const variantIdByOfferId = new Map(
      offers.map((offer) => [offer.id, offer.variantId]),
    );

    const order = await this.prisma.order.create({
      data: {
        userId,
        status: OrderStatus.PENDING_PAYMENT,
        currency: cart.currency ?? 'USD',
        subtotal: cart.subtotal,
        total: cart.subtotal,
        shippingAddress: shippingAddress as unknown as Prisma.InputJsonValue,
        items: {
          create: cart.items.map((item) => ({
            offerId: item.offerId,
            quantity: item.quantity,
            unitAmount: item.unitPrice?.amount ?? 0,
            currency: item.unitPrice?.currency ?? cart.currency ?? 'USD',
            lineTotal: item.lineTotal,
          })),
        },
      },
      include: { items: true },
    });

    const reservedItemIds: string[] = [];

    for (const item of order.items) {
      const variantId = variantIdByOfferId.get(item.offerId);

      if (!variantId) {
        await this.compensate(order.id, reservedItemIds);
        throw new ConflictException('Offer is no longer available');
      }

      try {
        const reservation = await this.inventoryService.reserve(
          variantId,
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
        await this.compensate(order.id, reservedItemIds);
        throw error;
      }
    }

    return this.findByIdOrThrow(order.id);
  }

  async confirmPayment(orderId: string): Promise<Order> {
    const order = await this.findByIdOrThrow(orderId);

    for (const item of order.items) {
      if (item.reservationId) {
        await this.inventoryService.commit(item.reservationId);
      }
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID },
    });
  }

  async cancel(orderId: string): Promise<Order> {
    const order = await this.findByIdOrThrow(orderId);

    for (const item of order.items) {
      if (item.reservationId) {
        await this.inventoryService.release(item.reservationId);
      }
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  }

  listOwn(userId: string): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: true },
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

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  }

  private async findByIdOrThrow(orderId: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }
}
