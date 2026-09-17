import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OfferStockSource,
  OrderStatus,
  Prisma,
  type Order,
  type OfferFulfillmentMode,
  type PaymentStatus,
  type OrderItem,
  type SellerOrder,
  type ShippingGroup,
} from '@prisma/client';

import { toAddressSnapshot } from '../../common/addresses/address-snapshot';
import { OfferReadService } from '../offers/offer-read.service';
import { PrismaService } from '../../database/prisma.service';
import { AddressesService } from '../users/addresses/addresses.service';
import { CartLineView } from '../cart/cart.types';
import { CartService } from '../cart/cart.service';
import { LedgerService } from '../financials/ledger.service';
import { InventoryService } from '../inventory/inventory.service';
import type { CommerceOffer } from '../offers/offer-read.service';
import {
  ShippingService,
  type ShippingLine,
  type ShippingQuoteGroup,
} from '../shipping/shipping.service';

export type ShippingGroupWithItems = ShippingGroup & { items: OrderItem[] };
export type SellerOrderWithItems = SellerOrder & {
  items: OrderItem[];
  shippingGroups: ShippingGroupWithItems[];
};

export type OrderWithItems = Order & {
  items: OrderItem[];
  sellerOrders: SellerOrderWithItems[];
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

type SellerGroup = { sellerId: string | null; items: ShippingLine[] };

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
type QuotedSellerGroup = SellerGroup & {
  shippingGroups: ShippingQuoteGroup[];
  subtotal: number;
  shippingAmount: number;
  total: number;
};

/**
 * The same cost breakdown a checkout call will charge, without creating an
 * order — what lets the checkout page show shipping before the shopper pays,
 * rather than only after.
 */
export type CheckoutQuote = {
  currency: string;
  subtotal: number;
  shippingAmount: number;
  total: number;
  shippingGroups: {
    sellerId: string | null;
    fulfillmentMode: OfferFulfillmentMode;
    serviceLevel: string;
    subtotal: number;
    shippingAmount: number;
    total: number;
    estimatedDeliveryMinDays: number;
    estimatedDeliveryMaxDays: number;
  }[];
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly inventoryService: InventoryService,
    private readonly addressesService: AddressesService,
    private readonly ledgerService: LedgerService,
    private readonly offers: OfferReadService,
    private readonly shippingService: ShippingService,
  ) {}

  /**
   * `itemIds`, when given, restricts the order to those cart lines — a
   * partial checkout — rather than everything in the cart.
   */
  async createFromCart(
    userId: string,
    shippingAddressId: string,
    currency: string,
    itemIds?: string[],
    idempotencyKey?: string,
  ): Promise<OrderWithItems> {
    const cart = await this.cartService.getCartView({ userId }, currency);
    const lines = itemIds
      ? cart.items.filter((item) => itemIds.includes(item.id))
      : cart.items;

    if (itemIds && lines.length !== itemIds.length) {
      throw new ConflictException(
        'One or more selected items are no longer in your cart',
      );
    }

    if (lines.length === 0) {
      throw new ConflictException(
        itemIds ? 'No items selected' : 'Cart is empty',
      );
    }

    if (lines.some((item) => !item.isAvailable)) {
      throw new ConflictException(
        'Cart has unavailable items; revalidate the cart before checking out',
      );
    }

    return this.createOrderFromLines(
      userId,
      lines,
      shippingAddressId,
      currency,
      idempotencyKey,
    );
  }

  /**
   * Checks one offer out directly, at its own quantity, leaving the
   * persisted cart untouched — "buy now" rather than "add, then checkout".
   */
  async createFromOffer(
    userId: string,
    offerId: string,
    quantity: number,
    shippingAddressId: string,
    currency: string,
    idempotencyKey?: string,
  ): Promise<OrderWithItems> {
    const line = await this.cartService.previewOfferLine(
      offerId,
      quantity,
      currency,
    );

    if (!line.isAvailable) {
      throw new ConflictException(
        'This item is not available for purchase right now',
      );
    }

    return this.createOrderFromLines(
      userId,
      [line],
      shippingAddressId,
      currency,
      idempotencyKey,
    );
  }

  /**
   * The cost breakdown a cart checkout would charge right now, without
   * creating an order.
   *
   * Mirrors `createFromCart`'s own line selection and validation exactly, so
   * a shopper is never quoted a total that checkout itself would then refuse
   * to honor.
   */
  async quoteFromCart(
    userId: string,
    shippingAddressId: string,
    currency: string,
    itemIds?: string[],
  ): Promise<CheckoutQuote> {
    const cart = await this.cartService.getCartView({ userId }, currency);
    const lines = itemIds
      ? cart.items.filter((item) => itemIds.includes(item.id))
      : cart.items;

    if (itemIds && lines.length !== itemIds.length) {
      throw new ConflictException(
        'One or more selected items are no longer in your cart',
      );
    }

    if (lines.length === 0) {
      throw new ConflictException(
        itemIds ? 'No items selected' : 'Cart is empty',
      );
    }

    if (lines.some((item) => !item.isAvailable)) {
      throw new ConflictException(
        'Cart has unavailable items; revalidate the cart before checking out',
      );
    }

    return this.quoteLines(userId, lines, shippingAddressId, currency);
  }

  /** The cost breakdown a "buy now" checkout would charge right now. */
  async quoteFromOffer(
    userId: string,
    offerId: string,
    quantity: number,
    shippingAddressId: string,
    currency: string,
  ): Promise<CheckoutQuote> {
    const line = await this.cartService.previewOfferLine(
      offerId,
      quantity,
      currency,
    );

    if (!line.isAvailable) {
      throw new ConflictException(
        'This item is not available for purchase right now',
      );
    }

    return this.quoteLines(userId, [line], shippingAddressId, currency);
  }

  private async quoteLines(
    userId: string,
    lines: CartLineView[],
    shippingAddressId: string,
    currency: string,
  ): Promise<CheckoutQuote> {
    const address = await this.addressesService.findOne(
      userId,
      shippingAddressId,
    );
    const shippingAddress = toAddressSnapshot(address);

    const offers = await this.offers.findMany(
      lines.map((item) => item.offerId),
    );
    const offerById = new Map(offers.map((offer) => [offer.id, offer]));

    const { subtotal, shippingAmount, quotedGroups } =
      await this.quoteSellerGroups(
        lines,
        offerById,
        shippingAddress.country,
        currency,
      );

    return {
      currency,
      subtotal,
      shippingAmount,
      total: subtotal + shippingAmount,
      shippingGroups: quotedGroups.flatMap((group) =>
        group.shippingGroups.map((shippingGroup) => ({
          sellerId: group.sellerId,
          fulfillmentMode: shippingGroup.fulfillmentMode,
          serviceLevel: shippingGroup.serviceLevel,
          subtotal: shippingGroup.subtotal,
          shippingAmount: shippingGroup.shippingAmount,
          total: shippingGroup.total,
          estimatedDeliveryMinDays: shippingGroup.estimatedDeliveryMinDays,
          estimatedDeliveryMaxDays: shippingGroup.estimatedDeliveryMaxDays,
        })),
      ),
    };
  }

  /**
   * Groups lines by seller and prices shipping for each group — the part of
   * checkout that a preview quote and an actual order both need, so the two
   * cannot drift apart.
   */
  private async quoteSellerGroups(
    lines: CartLineView[],
    offerById: Map<string, CommerceOffer>,
    destinationCountry: string,
    currency: string,
  ): Promise<{
    subtotal: number;
    shippingAmount: number;
    quotedGroups: QuotedSellerGroup[];
  }> {
    const groups = this.groupBySeller(lines, offerById);
    const subtotal = lines.reduce((sum, item) => sum + item.lineTotal, 0);

    const quotedGroups: QuotedSellerGroup[] = [];
    for (const group of [...groups].sort((left, right) =>
      (left.sellerId ?? '').localeCompare(right.sellerId ?? ''),
    )) {
      const shippingGroups = await this.shippingService.quoteSellerGroups(
        group.sellerId,
        group.items,
        destinationCountry,
        currency,
      );
      const groupSubtotal = shippingGroups.reduce(
        (sum, shippingGroup) => sum + shippingGroup.subtotal,
        0,
      );
      const groupShippingAmount = shippingGroups.reduce(
        (sum, shippingGroup) => sum + shippingGroup.shippingAmount,
        0,
      );
      quotedGroups.push({
        ...group,
        shippingGroups,
        subtotal: groupSubtotal,
        shippingAmount: groupShippingAmount,
        total: groupSubtotal + groupShippingAmount,
      });
    }
    const shippingAmount = quotedGroups.reduce(
      (sum, group) => sum + group.shippingAmount,
      0,
    );

    return { subtotal, shippingAmount, quotedGroups };
  }

  /**
   * The order a previous checkout call already created for this key, if any.
   *
   * Scoped to one user so two shoppers minting the same UUID never collide,
   * matching the `(userId, idempotencyKey)` unique constraint on `Order`.
   */
  findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<OrderWithItems | null> {
    return this.prisma.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: {
        items: true,
        sellerOrders: {
          include: {
            items: true,
            shippingGroups: { include: { items: true } },
          },
        },
        payment: CUSTOMER_PAYMENT_SELECT,
      },
    });
  }

  /**
   * Frees an idempotency key from an order that never reached payment, so a
   * fresh retry with the same key can create a new order instead of being
   * blocked by the unique constraint on a dead one.
   */
  async releaseIdempotencyKey(orderId: string): Promise<void> {
    await this.prisma.order.update({
      where: { id: orderId },
      data: { idempotencyKey: null },
    });
  }

  private async createOrderFromLines(
    userId: string,
    lines: CartLineView[],
    shippingAddressId: string,
    currency: string,
    idempotencyKey?: string,
  ): Promise<OrderWithItems> {
    const address = await this.addressesService.findOne(
      userId,
      shippingAddressId,
    );
    const shippingAddress = toAddressSnapshot(address);

    const offers = await this.offers.findMany(
      lines.map((item) => item.offerId),
    );
    const offerById = new Map(offers.map((offer) => [offer.id, offer]));

    const { subtotal, shippingAmount, quotedGroups } =
      await this.quoteSellerGroups(
        lines,
        offerById,
        shippingAddress.country,
        currency,
      );

    let createdOrderId: string;
    try {
      createdOrderId = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            userId,
            status: OrderStatus.PENDING_PAYMENT,
            currency,
            subtotal,
            shippingAmount,
            total: subtotal + shippingAmount,
            shippingAddress:
              shippingAddress as unknown as Prisma.InputJsonValue,
            idempotencyKey: idempotencyKey ?? null,
          },
        });

        for (const group of quotedGroups) {
          if (group.sellerId)
            await this.ledgerService.ensureCurrency(
              group.sellerId,
              currency,
              tx,
            );

          const sellerOrder = await tx.sellerOrder.create({
            data: {
              orderId: order.id,
              sellerId: group.sellerId,
              status: OrderStatus.PENDING_PAYMENT,
              currency,
              subtotal: group.subtotal,
              shippingAmount: group.shippingAmount,
              total: group.total,
            },
          });

          for (const shippingGroup of group.shippingGroups) {
            const createdShippingGroup = await tx.shippingGroup.create({
              data: {
                orderId: order.id,
                sellerOrderId: sellerOrder.id,
                fulfillmentMode: shippingGroup.fulfillmentMode,
                serviceLevel: shippingGroup.serviceLevel,
                rateCode: shippingGroup.rateCode,
                subtotal: shippingGroup.subtotal,
                shippingAmount: shippingGroup.shippingAmount,
                total: shippingGroup.total,
                currency: shippingGroup.currency,
                quoteId: shippingGroup.quoteId,
                quoteExpiresAt: shippingGroup.quoteExpiresAt,
                estimatedDeliveryMinDays:
                  shippingGroup.estimatedDeliveryMinDays,
                estimatedDeliveryMaxDays:
                  shippingGroup.estimatedDeliveryMaxDays,
                items: {
                  create: shippingGroup.items.map((item) => ({
                    orderId: order.id,
                    sellerOrderId: sellerOrder.id,
                    offerId: item.offerId,
                    quantity: item.quantity,
                    unitAmount: item.unitPrice?.amount ?? 0,
                    currency: item.unitPrice?.currency ?? currency,
                    lineTotal: item.lineTotal,
                  })),
                },
              },
              include: { items: true },
            });

            // Reserving here, inside the same transaction that creates the
            // order, means a failed reservation rolls the whole order back
            // instead of leaving it to a separate compensation step that a
            // crash between the two could skip.
            for (const item of createdShippingGroup.items) {
              const offer = offerById.get(item.offerId);

              if (!offer)
                throw new ConflictException('Offer is no longer available');

              const reservation =
                offer.stockSource === OfferStockSource.SELLER
                  ? await this.inventoryService.reserveOffer(
                      offer.id,
                      item.quantity,
                      { holderType: 'order_item', holderId: item.id },
                      tx,
                    )
                  : await this.inventoryService.reserve(
                      offer.variantId,
                      item.quantity,
                      { holderType: 'order_item', holderId: item.id },
                      tx,
                    );
              await tx.orderItem.update({
                where: { id: item.id },
                data: { reservationId: reservation.id },
              });
            }
          }
        }

        return order.id;
      });
    } catch (error) {
      // Two requests racing on the same key both pass the caller's
      // pre-check; the loser hits this constraint instead of silently
      // creating a second order. The transaction already rolled back, so
      // there is nothing left to compensate.
      if (idempotencyKey && isUniqueConstraintViolation(error))
        throw new ConflictException(
          'A checkout with this idempotency key is already in progress',
        );
      throw error;
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
        sellerOrders: {
          include: {
            items: true,
            shippingGroups: { include: { items: true } },
          },
        },
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
  private groupBySeller(
    items: CartLineView[],
    offerById: Map<string, CommerceOffer>,
  ): SellerGroup[] {
    const groups = new Map<string | null, ShippingLine[]>();

    for (const item of items) {
      const offer = offerById.get(item.offerId);
      if (!offer || offer.sellerId !== item.sellerId)
        throw new ConflictException(
          'Offer ownership changed; reload the cart before checking out',
        );
      const shippingLine = {
        ...item,
        fulfillmentMode: offer.fulfillmentMode,
      };
      const existing = groups.get(offer.sellerId);

      if (existing) {
        existing.push(shippingLine);
      } else {
        groups.set(offer.sellerId, [shippingLine]);
      }
    }

    return [...groups.entries()].map(([sellerId, groupItems]) => ({
      sellerId,
      items: groupItems,
    }));
  }

  private async findByIdOrThrow(
    orderId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<OrderWithItems> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        sellerOrders: {
          include: {
            items: true,
            shippingGroups: { include: { items: true } },
          },
        },
        payment: CUSTOMER_PAYMENT_SELECT,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }
}
