import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OfferStockSource,
  OrderStatus,
  type Order,
  type PaymentStatus,
  type OrderItem,
  type Prisma,
  type SellerOrder,
} from '@prisma/client';

import { toAddressSnapshot } from '../../common/addresses/address-snapshot';
import { OfferReadService } from '../offers/offer-read.service';
import { PrismaService } from '../../database/prisma.service';
import { AddressesService } from '../users/addresses/addresses.service';
import { CartLineView } from '../cart/cart.types';
import { CartService } from '../cart/cart.service';
import { LedgerService } from '../financials/ledger.service';
import { InventoryService } from '../inventory/inventory.service';

export type OrderWithItems = Order & {
  items: OrderItem[];
  sellerOrders: (SellerOrder & { items: OrderItem[] })[];
  /**
   * Present on a customer's own reads so a client can tell an order awaiting
   * approval from one whose payment failed, and can ask for that payment to
   * be reconciled. Null until checkout has created one.
   */
  payment?: {
    id: string;
    status: PaymentStatus;
    failureReason: string | null;
  } | null;
};

/** What a customer is shown about the payment behind their order. */
const CUSTOMER_PAYMENT_SELECT = {
  select: { id: true, status: true, failureReason: true },
} as const;

type SellerGroup = { sellerId: string | null; items: CartLineView[] };

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly inventoryService: InventoryService,
    private readonly addressesService: AddressesService,
    private readonly ledgerService: LedgerService,
    private readonly offers: OfferReadService,
  ) {}

  async createFromCart(
    userId: string,
    shippingAddressId: string,
    currency: string,
  ): Promise<OrderWithItems> {
    const cart = await this.cartService.getCartView({ userId }, currency);

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

    const offers = await this.offers.findMany(
      cart.items.map((item) => item.offerId),
    );
    const offerById = new Map(offers.map((offer) => [offer.id, offer]));
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

      for (const group of [...groups].sort((a, b) =>
        (a.sellerId ?? '').localeCompare(b.sellerId ?? ''),
      )) {
        if (group.sellerId)
          await this.ledgerService.ensureCurrency(group.sellerId, currency, tx);
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

  async lockForPayment(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
  }

  async confirmPayment(
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Order> {
    if (!tx)
      return this.prisma.$transaction((client) =>
        this.confirmPayment(orderId, client),
      );
    await this.lockForPayment(orderId, tx);
    const order = await this.findByIdOrThrow(orderId, tx);
    if (
      [
        OrderStatus.PAID,
        OrderStatus.PARTIALLY_REFUNDED,
        OrderStatus.REFUNDED,
      ].includes(order.status as never)
    )
      return order;
    if (order.status !== OrderStatus.PENDING_PAYMENT)
      throw new ConflictException('Only a pending order can be paid');
    for (const item of [...order.items].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      if (item.reservationId)
        await this.inventoryService.commit(item.reservationId, tx);
    }
    await tx.sellerOrder.updateMany({
      where: { orderId },
      data: { status: OrderStatus.PAID },
    });
    for (const sellerOrder of [...order.sellerOrders].sort((a, b) =>
      (a.sellerId ?? '').localeCompare(b.sellerId ?? ''),
    ))
      await this.ledgerService.recordSale(sellerOrder, tx);
    return tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID },
    });
  }

  async getSellerOrderForPayment(
    sellerOrderId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<SellerOrder> {
    const sellerOrder = await tx.sellerOrder.findUnique({
      where: { id: sellerOrderId },
    });
    if (!sellerOrder) throw new NotFoundException('Seller order not found');
    return sellerOrder;
  }

  async applyRefund(
    sellerOrderId: string,
    amount: number,
    tx?: Prisma.TransactionClient,
  ): Promise<SellerOrder> {
    if (!tx)
      return this.prisma.$transaction((client) =>
        this.applyRefund(sellerOrderId, amount, client),
      );
    const initial = await this.getSellerOrderForPayment(sellerOrderId, tx);
    await this.lockForPayment(initial.orderId, tx);
    const sellerOrder = await tx.sellerOrder.findUniqueOrThrow({
      where: { id: sellerOrderId },
      include: { items: true },
    });
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      ![OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED].includes(
        sellerOrder.status as never,
      ) ||
      amount > sellerOrder.total - sellerOrder.refundedAmount
    )
      throw new ConflictException(
        'Refund exceeds the refundable balance or order is not paid',
      );
    const refundedAmount = sellerOrder.refundedAmount + amount;
    const fullyRefunded = refundedAmount === sellerOrder.total;
    const updated = await tx.sellerOrder.update({
      where: { id: sellerOrderId },
      data: {
        refundedAmount,
        status: fullyRefunded
          ? OrderStatus.REFUNDED
          : OrderStatus.PARTIALLY_REFUNDED,
      },
    });
    if (fullyRefunded) {
      for (const item of [...sellerOrder.items].sort((a, b) =>
        a.id.localeCompare(b.id),
      ))
        if (item.reservationId)
          await this.inventoryService.restock(item.reservationId, tx);
    }
    const groups = await tx.sellerOrder.findMany({
      where: { orderId: sellerOrder.orderId },
    });
    await tx.order.update({
      where: { id: sellerOrder.orderId },
      data: {
        status: groups.every((group) => group.status === OrderStatus.REFUNDED)
          ? OrderStatus.REFUNDED
          : OrderStatus.PARTIALLY_REFUNDED,
      },
    });
    return updated;
  }

  async cancel(orderId: string, tx?: Prisma.TransactionClient): Promise<Order> {
    if (!tx)
      return this.prisma.$transaction((client) => this.cancel(orderId, client));
    await this.lockForPayment(orderId, tx);
    const order = await this.findByIdOrThrow(orderId, tx);
    if (order.status === OrderStatus.CANCELLED) return order;
    if (order.status !== OrderStatus.PENDING_PAYMENT)
      throw new ConflictException(
        'A paid order must be refunded, not cancelled',
      );
    for (const item of [...order.items].sort((a, b) =>
      a.id.localeCompare(b.id),
    ))
      if (item.reservationId)
        await this.inventoryService.release(item.reservationId, tx);
    await tx.sellerOrder.updateMany({
      where: { orderId },
      data: { status: OrderStatus.CANCELLED },
    });
    return tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  }

  listOwn(userId: string): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        items: true,
        sellerOrders: { include: { items: true } },
        payment: CUSTOMER_PAYMENT_SELECT,
      },
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

  private async findByIdOrThrow(
    orderId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<OrderWithItems> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        sellerOrders: { include: { items: true } },
        payment: CUSTOMER_PAYMENT_SELECT,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }
}
