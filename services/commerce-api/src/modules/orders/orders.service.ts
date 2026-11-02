import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FulfillmentWorkItemType,
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
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  PaginationQueryDto,
} from '../../common/pagination/pagination-query.dto';
import { OfferReadService } from '../offers/offer-read.service';
import { PrismaService } from '../../database/prisma.service';
import { BackgroundJobsService } from '../../infrastructure/jobs/background-jobs.service';
import { OutboxService } from '../../infrastructure/jobs/outbox.service';
import { AddressesService } from '../users/addresses/addresses.service';
import { CartLineView } from '../cart/cart.types';
import { CartService } from '../cart/cart.service';
import { CART_CLEANUP_JOB_TYPE } from '../cart/jobs/cart-cleanup.handler';
import {
  CHECKOUT_ATTEMPT_LEASE_MS,
  CheckoutAttemptSupersededError,
} from '../checkout/checkout-attempt.errors';
import {
  CustomerFulfillmentSummary,
  deriveCustomerFulfillmentSummary,
} from '../fulfillment/customer-fulfillment-summary';
import { FULFILLMENT_PROVISION_JOB_TYPE } from '../fulfillment/jobs/fulfillment-provision.handler';
import { LedgerService } from '../financials/ledger.service';
import { InventoryService } from '../inventory/inventory.service';
import type { CommerceOffer } from '../offers/offer-read.service';
import {
  ShippingService,
  type ShippingLine,
  type ShippingQuoteGroup,
} from '../shipping/shipping.service';
import {
  ADMIN_ORDER_CUSTOMER_SELECT,
  ADMIN_ORDER_ITEM_OFFER_SELECT,
  type AdminOrderDetail,
  toAdminOrderDetail,
} from './admin-order-detail';
import {
  UNPAID_ORDER_EXPIRY_DELAY_MS,
  UNPAID_ORDER_EXPIRY_JOB_TYPE,
  UNPAID_ORDER_EXPIRY_MAX_ATTEMPTS,
} from './jobs/unpaid-order-expiry.job';

export type ShippingGroupWithItems = ShippingGroup & { items: OrderItem[] };
export type SellerOrderWithItems = SellerOrder & {
  items: OrderItem[];
  shippingGroups: ShippingGroupWithItems[];
};

/**
 * The cart lines a checkout consumed, kept on the order only so the cart
 * cleanup that follows payment can delete exactly those line versions. It is
 * persistence detail: no read that leaves this service may carry it, so every
 * order read here passes this `omit`.
 */
export const ORDER_OMIT = { checkoutCartSnapshot: true } as const;

/** An order row as callers see it — without `checkoutCartSnapshot`. */
export type OrderRecord = Omit<Order, 'checkoutCartSnapshot'>;

/**
 * The checkout attempt a keyed checkout runs under. The order transaction
 * links the order to it only while this owner still holds it, so a request
 * whose lease was taken over can never attach a second order.
 */
export type CheckoutAttemptFence = { id: string; ownerToken: string };

type CheckoutCartSnapshot = Awaited<
  ReturnType<CartService['getCheckoutSnapshot']>
>;

/** How long a checkout waits before its durable cart cleanup first runs. */
const CART_CLEANUP_DELAY_MS = 60_000;
const CART_CLEANUP_MAX_ATTEMPTS = 20;

export type OrderWithItems = OrderRecord & {
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
  /**
   * A small customer-facing vocabulary over the order's fulfillment orders
   * (warehouse/staff detail never leaks here) — see
   * deriveCustomerFulfillmentSummary. Undefined on admin reads that don't
   * need it (findAny/listAll), present on customer-facing ones.
   */
  fulfillmentSummary?: CustomerFulfillmentSummary;
  /**
   * When packing finished — the PACK work item's own `completedAt`, not a
   * status. Present alongside `fulfillmentSummary`, null until packing is
   * actually done (or there's nothing to show a time for, e.g. a fully
   * cancelled order).
   */
  packedAt?: Date | null;
};

export type OrderPage = {
  items: OrderWithItems[];
  total: number;
  page: number;
  limit: number;
};

/** What a customer is shown about the payment behind their order. */
const CUSTOMER_PAYMENT_SELECT = {
  select: { id: true, status: true, failureReason: true },
} as const;

type SellerGroup = { sellerId: string | null; items: ShippingLine[] };

/**
 * A unique violation on the order's (userId, idempotencyKey). When Prisma
 * reports no target the violation is still attributed to the key — the only
 * unique constraint a fresh order transaction can plausibly hit.
 */
function isIdempotencyKeyConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  )
    return false;
  const target: unknown = error.meta?.target;
  if (target === undefined || target === null) return true;
  return JSON.stringify(target).toLowerCase().includes('idempotency');
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
    private readonly backgroundJobsService: BackgroundJobsService,
    private readonly outboxService: OutboxService,
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
    attempt?: CheckoutAttemptFence,
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

    // The receipt of exactly the selected line versions this order is
    // priced from. The order transaction re-checks it under the cart lock,
    // and the post-payment cleanup deletes only lines still matching it, so
    // an edit made meanwhile is never charged stale nor silently deleted.
    const snapshot = await this.cartService.getCheckoutSnapshot(
      userId,
      lines.map((line) => line.id),
    );
    const snapshotById = new Map(snapshot.map((row) => [row.id, row]));
    if (
      snapshot.length !== lines.length ||
      lines.some((line) => {
        const row = snapshotById.get(line.id);
        return (
          !row || row.offerId !== line.offerId || row.quantity !== line.quantity
        );
      })
    )
      throw new ConflictException(
        'Cart changed; review your cart and check out again',
      );

    // The snapshot comes in the canonical allocation order — cart line
    // (createdAt, id) — the same order the cart's own stock check allocates
    // in, so checkout reserves lines in it too.
    const lineById = new Map(lines.map((line) => [line.id, line]));
    const orderedLines = snapshot.map((row) => lineById.get(row.id)!);

    return this.createOrderFromLines(
      userId,
      orderedLines,
      shippingAddressId,
      currency,
      idempotencyKey,
      attempt,
      snapshot,
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
    attempt?: CheckoutAttemptFence,
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
      attempt,
    );
  }

  /** The order a resumed checkout attempt continues with. */
  findForCheckout(orderId: string): Promise<OrderWithItems> {
    return this.findByIdOrThrow(orderId);
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
   * `lines` must come in the canonical allocation order (cart line
   * createdAt, then id): reservations are taken in exactly that order.
   */
  private async createOrderFromLines(
    userId: string,
    lines: CartLineView[],
    shippingAddressId: string,
    currency: string,
    idempotencyKey?: string,
    attempt?: CheckoutAttemptFence,
    cartSnapshot?: CheckoutCartSnapshot,
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
            ...(cartSnapshot
              ? {
                  checkoutCartSnapshot: cartSnapshot.map(
                    ({ id, offerId, quantity, revision }) => ({
                      id,
                      offerId,
                      quantity,
                      revision,
                    }),
                  ),
                }
              : {}),
          },
          select: { id: true },
        });

        // Locks follow the global order: checkout attempt, cart, offers (KEY
        // SHARE), every inventory record (ascending id), then reservations.
        if (attempt) {
          // Fenced on the owner token and on no order being linked yet: a
          // request whose lease expired and was claimed by a retry must not
          // attach a second order to the same attempt.
          const linked = await tx.checkoutAttempt.updateMany({
            where: {
              id: attempt.id,
              ownerToken: attempt.ownerToken,
              status: 'IN_PROGRESS',
              orderId: null,
            },
            data: {
              orderId: order.id,
              stage: 'ORDER_CREATED',
              leaseExpiresAt: new Date(Date.now() + CHECKOUT_ATTEMPT_LEASE_MS),
            },
          });
          if (linked.count !== 1) throw new CheckoutAttemptSupersededError();
        }

        if (cartSnapshot)
          await this.cartService.lockAndVerifyCheckoutSnapshot(
            tx,
            userId,
            cartSnapshot,
          );

        // Each order item insert below takes FOR KEY SHARE on its offer
        // through the foreign key. Taking those locks now, before any
        // inventory record, keeps offers ahead of inventory records — the
        // order a product hard delete locks them in.
        await this.inventoryService.lockOffersForKeyShare(
          offers.map((offer) => offer.id),
          tx,
        );
        const lockedRecordIds = await this.inventoryService.lockStockPools(
          offers,
          tx,
        );

        const createdItems: OrderItem[] = [];
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
                providerCode: shippingGroup.providerCode,
                carrierCode: shippingGroup.carrierCode,
                methodCode: shippingGroup.methodCode,
                methodName: shippingGroup.methodName,
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
            createdItems.push(...createdShippingGroup.items);
          }
        }

        // Reserving here, inside the same transaction that creates the
        // order, means a failed reservation rolls the whole order back
        // instead of leaving it to a separate compensation step that a crash
        // between the two could skip.
        //
        // Every item is reserved in `lines` order (one line per offer), not
        // seller/shipping-group order: first-fit allocation across a shared
        // pool depends on the order demands arrive in, and this is the order
        // the cart's stock check assumed.
        const rankByOfferId = new Map(
          lines.map((line, index) => [line.offerId, index]),
        );
        createdItems.sort(
          (left, right) =>
            (rankByOfferId.get(left.offerId) ?? 0) -
            (rankByOfferId.get(right.offerId) ?? 0),
        );
        for (const item of createdItems) {
          const offer = offerById.get(item.offerId);

          if (!offer)
            throw new ConflictException('Offer is no longer available');

          const reserveOptions = {
            holderType: 'order_item',
            holderId: item.id,
            lockedRecordIds,
          };
          const reservation =
            offer.stockSource === OfferStockSource.SELLER
              ? await this.inventoryService.reserveOffer(
                  offer.id,
                  item.quantity,
                  reserveOptions,
                  tx,
                )
              : await this.inventoryService.reserve(
                  offer.variantId,
                  item.quantity,
                  reserveOptions,
                  tx,
                );
          await tx.orderItem.update({
            where: { id: item.id },
            data: { reservationId: reservation.id },
          });
        }

        // Durable from the moment the order exists, so a request that dies
        // after payment still gets its checked-out lines cleared. The
        // handler waits on (and preserves the cart for) the payment outcome,
        // so enqueueing before payment starts is safe.
        if (cartSnapshot) await this.enqueueCartCleanup(userId, order.id, tx);
        // Equally durable: if no payment is ever started for this order (a
        // keyed checkout kept it for a same-key retry that never came, or a
        // compensating cancel failed), the reaper cancels it once its
        // reservations have lapsed. A no-op for an order that got a payment.
        await this.backgroundJobsService.enqueue(
          {
            type: UNPAID_ORDER_EXPIRY_JOB_TYPE,
            payload: { orderId: order.id },
            runAt: new Date(Date.now() + UNPAID_ORDER_EXPIRY_DELAY_MS),
            maxAttempts: UNPAID_ORDER_EXPIRY_MAX_ATTEMPTS,
          },
          tx,
        );
        return order.id;
      });
    } catch (error) {
      // Two requests racing on the same key both pass the caller's
      // pre-check; the loser hits this constraint instead of silently
      // creating a second order. The transaction already rolled back, so
      // there is nothing left to compensate.
      if (idempotencyKey && isIdempotencyKeyConflict(error)) {
        // Under an attempt fence the winner is the request that now owns the
        // attempt (it took over after this one's lease lapsed), so this one
        // was superseded and must record nothing about the attempt.
        if (attempt) throw new CheckoutAttemptSupersededError();
        throw new ConflictException(
          'A checkout with this idempotency key is already in progress',
        );
      }
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

  private async enqueueCartCleanup(
    userId: string,
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.backgroundJobsService.enqueue(
      {
        type: CART_CLEANUP_JOB_TYPE,
        payload: { userId, orderId },
        runAt: new Date(Date.now() + CART_CLEANUP_DELAY_MS),
        maxAttempts: CART_CLEANUP_MAX_ATTEMPTS,
      },
      tx,
    );
  }

  async confirmPayment(
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderRecord> {
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
    await this.inventoryService.commitMany(this.reservationIds(order), tx);
    await tx.sellerOrder.updateMany({
      where: { orderId },
      data: { status: OrderStatus.PAID },
    });
    for (const sellerOrder of [...order.sellerOrders].sort((a, b) =>
      (a.sellerId ?? '').localeCompare(b.sellerId ?? ''),
    ))
      await this.ledgerService.recordSale(sellerOrder, tx);
    const paid = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID },
      omit: ORDER_OMIT,
    });

    // Provisioning is enqueued as its own job rather than driven by the
    // outbox, so it is created and retried independently of the outbox's
    // subscribers. The `order.paid` event alongside it is consumed by the
    // OutboxDispatcherService's subscribers (NotificationsOutboxSubscriber sends
    // the customer's order confirmation); nothing there provisions stock.
    await this.backgroundJobsService.enqueue(
      { type: FULFILLMENT_PROVISION_JOB_TYPE, payload: { orderId } },
      tx,
    );
    await this.outboxService.record(
      {
        topic: 'order.paid',
        aggregateType: 'Order',
        aggregateId: orderId,
        payload: { orderId },
      },
      tx,
    );

    // A payment that settles after checkout returned (webhook, reconcile)
    // still owes the cart its cleanup. The job is idempotent, so one beside
    // the order transaction's own is harmless.
    const { checkoutCartSnapshot } = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { checkoutCartSnapshot: true },
    });
    if (checkoutCartSnapshot !== null)
      await this.enqueueCartCleanup(order.userId, orderId, tx);

    return paid;
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
    // Reservation stock is no longer auto-restocked here on full refund — a
    // refund is a money event, not proof the physical item came back.
    // Restocking now only happens through the Returns module, once
    // inspected quantity is actually dispositioned RESTOCK (see
    // InventoryService.receiveReturnedStock), so a refund issued before the
    // item is returned (or one that never gets a physical return, e.g. an
    // admin goodwill refund) can never double-restock alongside a later
    // accepted return.
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

  async cancel(
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderRecord> {
    if (!tx)
      return this.prisma.$transaction((client) => this.cancel(orderId, client));
    await this.lockForPayment(orderId, tx);
    const order = await this.findByIdOrThrow(orderId, tx);
    if (order.status === OrderStatus.CANCELLED) return order;
    if (order.status !== OrderStatus.PENDING_PAYMENT)
      throw new ConflictException(
        'A paid order must be refunded, not cancelled',
      );
    await this.inventoryService.releaseMany(this.reservationIds(order), tx);
    await tx.sellerOrder.updateMany({
      where: { orderId },
      data: { status: OrderStatus.CANCELLED },
    });
    return tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
      omit: ORDER_OMIT,
    });
  }

  private reservationIds(order: OrderWithItems): string[] {
    return order.items.flatMap((item) =>
      item.reservationId ? [item.reservationId] : [],
    );
  }

  async listOwn(userId: string): Promise<OrderWithItems[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      omit: ORDER_OMIT,
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

    return this.attachFulfillmentSummaries(orders);
  }

  async findOwn(userId: string, orderId: string): Promise<OrderWithItems> {
    const order = await this.findByIdOrThrow(orderId);

    if (order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    const withSummary = await this.attachFulfillmentSummaries([order]);
    return withSummary[0] ?? order;
  }

  /**
   * Admin read — no ownership check, no fulfillmentSummary (staff use the
   * dedicated fulfillment endpoints for warehouse/staff detail instead).
   *
   * Unlike the customer reads it joins each item's product/variant names and
   * the customer's contact detail in the same query, so the admin order page
   * can name its lines and its buyer without a lookup per line.
   */
  async findAny(orderId: string): Promise<AdminOrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      omit: ORDER_OMIT,
      include: {
        items: { include: { offer: ADMIN_ORDER_ITEM_OFFER_SELECT } },
        sellerOrders: {
          include: {
            items: true,
            shippingGroups: { include: { items: true } },
          },
        },
        payment: CUSTOMER_PAYMENT_SELECT,
        user: ADMIN_ORDER_CUSTOMER_SELECT,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return toAdminOrderDetail(order);
  }

  async listAll(
    query: PaginationQueryDto & { status?: OrderStatus },
  ): Promise<OrderPage> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const where = query.status ? { status: query.status } : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        omit: ORDER_OMIT,
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
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  private async attachFulfillmentSummaries(
    orders: OrderWithItems[],
  ): Promise<OrderWithItems[]> {
    if (orders.length === 0) return orders;

    const fulfillmentOrders = await this.prisma.fulfillmentOrder.findMany({
      where: { orderId: { in: orders.map((order) => order.id) } },
      select: {
        orderId: true,
        status: true,
        // The PACK work item's own completedAt is the only record of when
        // packing actually finished — recomputeStatus derives PACKED as a
        // status, not a timestamp, so the shipping timeline's "Preparing for
        // shipment" step has nothing else to show a time against.
        workItems: {
          where: { type: FulfillmentWorkItemType.PACK },
          select: { completedAt: true },
        },
      },
    });
    const statusesByOrderId = new Map<
      string,
      (typeof fulfillmentOrders)[number]['status'][]
    >();
    const packedAtByOrderId = new Map<string, Date>();
    for (const fo of fulfillmentOrders) {
      const list = statusesByOrderId.get(fo.orderId) ?? [];
      list.push(fo.status);
      statusesByOrderId.set(fo.orderId, list);

      for (const workItem of fo.workItems) {
        if (!workItem.completedAt) continue;
        const current = packedAtByOrderId.get(fo.orderId);
        if (!current || workItem.completedAt > current) {
          packedAtByOrderId.set(fo.orderId, workItem.completedAt);
        }
      }
    }

    return orders.map((order) => {
      const fulfillmentSummary = deriveCustomerFulfillmentSummary(
        statusesByOrderId.get(order.id) ?? [],
      );
      const packed =
        fulfillmentSummary === 'PACKED' ||
        fulfillmentSummary === 'PARTIALLY_DISPATCHED' ||
        fulfillmentSummary === 'DISPATCHED';

      return {
        ...order,
        fulfillmentSummary,
        packedAt: packed ? (packedAtByOrderId.get(order.id) ?? null) : null,
      };
    });
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
      omit: ORDER_OMIT,
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
