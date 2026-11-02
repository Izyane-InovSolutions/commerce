import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CartStatus,
  OfferStockSource,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ProductStatus,
  SellerStatus,
  type Cart,
} from '@prisma/client';

import {
  currentPrices,
  pickCurrentPrice,
} from '../../common/catalog/current-price';
import {
  OfferReadService,
  type CommerceOffer,
} from '../offers/offer-read.service';
import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  MAX_INT4,
  canAllocateFirstFit,
  stockPoolKey,
  type StockPoolKey,
} from '../inventory/stock-allocation';
import {
  AddItemResult,
  CartIdentity,
  CartLineView,
  CartView,
  CheckoutCartSnapshotLine,
  CheckoutCartSnapshotRow,
} from './cart.types';
import { generateGuestToken } from './guest-token.util';

/** What cleanup needs of a snapshot line to recognise it in the cart. */
type CleanupReceiptLine = Pick<
  CheckoutCartSnapshotLine,
  'id' | 'quantity' | 'revision'
>;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly offers: OfferReadService,
  ) {}

  async getCartView(
    identity: CartIdentity,
    currency: string,
  ): Promise<CartView> {
    const cart = await this.findCart(identity);

    if (!cart) {
      return this.emptyView(currency);
    }

    return this.buildView(cart.id, currency);
  }

  async addItem(
    identity: CartIdentity,
    offerId: string,
    quantity: number,
    currency: string,
  ): Promise<AddItemResult> {
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    const offer = await this.offers.find(offerId);

    if (!offer || offer.status !== ProductStatus.PUBLISHED) {
      throw new BadRequestException('This offer is not available');
    }
    if (offer.sellerId && offer.seller?.status !== SellerStatus.APPROVED) {
      throw new BadRequestException(
        'This seller is not currently accepting orders',
      );
    }

    const { cart, newGuestToken } = await this.getOrCreateCart(identity);

    await this.withActiveCart(cart.id, async (tx) => {
      const existing = await tx.cartItem.findUnique({
        where: { cartId_offerId: { cartId: cart.id, offerId } },
      });
      const resulting = (existing?.quantity ?? 0) + quantity;
      this.assertQuantityFits(resulting);

      await tx.cartItem.upsert({
        where: { cartId_offerId: { cartId: cart.id, offerId } },
        create: { cartId: cart.id, offerId, quantity },
        update: { quantity: resulting, revision: { increment: 1 } },
      });
      await this.assertStockAllows(tx, cart.id, new Set([offerId]));
    });

    return {
      view: await this.buildView(cart.id, currency),
      guestToken: newGuestToken,
    };
  }

  async updateItemQuantity(
    identity: CartIdentity,
    itemId: string,
    quantity: number,
    currency: string,
  ): Promise<CartView> {
    if (quantity <= 0) {
      throw new BadRequestException(
        'quantity must be positive; use DELETE to remove a line',
      );
    }

    const cart = await this.findCartOrThrow(identity);
    await this.withActiveCart(cart.id, async (tx) => {
      const item = await tx.cartItem.findFirst({
        where: { id: itemId, cartId: cart.id },
      });
      if (!item) throw new NotFoundException('Cart item not found');
      this.assertQuantityFits(quantity);

      // The revision moves even when the quantity does not: a checkout
      // receipt taken before this edit must no longer match the line.
      await tx.cartItem.update({
        where: { id: item.id },
        data: { quantity, revision: { increment: 1 } },
      });
      if (quantity > item.quantity) {
        await this.assertStockAllows(tx, cart.id, new Set([item.offerId]));
      }
    });

    return this.buildView(cart.id, currency);
  }

  async removeItem(
    identity: CartIdentity,
    itemId: string,
    currency: string,
  ): Promise<CartView> {
    const cart = await this.findCartOrThrow(identity);
    await this.withActiveCart(cart.id, async (tx) => {
      const removed = await tx.cartItem.deleteMany({
        where: { id: itemId, cartId: cart.id },
      });
      if (!removed.count) throw new NotFoundException('Cart item not found');
    });

    return this.buildView(cart.id, currency);
  }

  /**
   * Prices and checks the availability of one offer as a cart line, without
   * reading or writing the persisted cart.
   *
   * Backs "buy now": a shopper can check a single offer out directly, and
   * this is what lets that path reuse the exact same availability and
   * pricing rules a cart line gets, rather than a second copy of them.
   */
  async previewOfferLine(
    offerId: string,
    quantity: number,
    currency: string,
  ): Promise<CartLineView> {
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    const offer = await this.offers.find(offerId);
    const offerById = new Map(offer ? [[offer.id, offer]] : []);
    const sellerStock = offer?.stockSource === OfferStockSource.SELLER;
    const quantities =
      offer && !sellerStock
        ? await this.inventoryService.getAvailableQuantities([offer.variantId])
        : new Map<string, number>();
    const offerQuantities =
      offer && sellerStock
        ? await this.inventoryService.getAvailableOfferQuantities([offer.id])
        : new Map<string, number>();

    return this.toLineView(
      { id: `buy-now:${offerId}`, offerId, quantity },
      offerById,
      quantities,
      offerQuantities,
      currency,
    );
  }

  async clearCart(identity: CartIdentity): Promise<void> {
    const cart = await this.findCart(identity);

    if (!cart) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      if (!(await this.lockActiveCart(tx, cart.id))) return;
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    });
  }

  /**
   * Removes only the named lines, leaving the rest of the cart as it is.
   *
   * Backs a partial checkout: a shopper who pays for some of their cart
   * should still find whatever they left unselected still there afterwards.
   */
  async removeItems(identity: CartIdentity, itemIds: string[]): Promise<void> {
    const cart = await this.findCart(identity);

    if (!cart) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      if (!(await this.lockActiveCart(tx, cart.id))) return;
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id, id: { in: itemIds } },
      });
    });
  }

  /**
   * Folds a guest cart into the user's, all or nothing: if any resulting line
   * would exceed available stock the merge is refused with 409 and neither
   * cart changes. A guest cart is consumed exactly once — a concurrent merge
   * that finds it already MERGED is a no-op.
   */
  async mergeGuestCart(
    userId: string,
    guestToken: string | undefined,
    currency: string,
  ): Promise<CartView> {
    if (!guestToken) {
      return this.getCartView({ userId }, currency);
    }

    const guestCart = await this.prisma.cart.findUnique({
      where: { guestToken },
    });

    if (!guestCart || guestCart.status !== CartStatus.ACTIVE) {
      return this.getCartView({ userId }, currency);
    }

    const { cart: userCart } = await this.getOrCreateCart({ userId });

    await this.prisma.$transaction(async (tx) => {
      await this.lockCarts(tx, [guestCart.id, userCart.id]);

      const guest = await tx.cart.findUnique({
        where: { id: guestCart.id },
        include: { items: true },
      });
      if (guest?.status !== CartStatus.ACTIVE) return;

      const user = await tx.cart.findUnique({
        where: { id: userCart.id },
        include: { items: true },
      });
      if (user?.status !== CartStatus.ACTIVE) {
        throw new ConflictException('Cart is no longer active');
      }

      const current = new Map(
        user.items.map((item) => [item.offerId, item.quantity]),
      );
      const merged = guest.items
        .map((item) => ({
          offerId: item.offerId,
          quantity: (current.get(item.offerId) ?? 0) + item.quantity,
        }))
        .sort((a, b) => a.offerId.localeCompare(b.offerId));
      for (const line of merged) this.assertQuantityFits(line.quantity);

      for (const line of merged) {
        await tx.cartItem.upsert({
          where: {
            cartId_offerId: { cartId: userCart.id, offerId: line.offerId },
          },
          create: {
            cartId: userCart.id,
            offerId: line.offerId,
            quantity: line.quantity,
          },
          update: { quantity: line.quantity, revision: { increment: 1 } },
        });
      }

      await tx.cart.update({
        where: { id: guestCart.id },
        data: { status: CartStatus.MERGED },
      });

      // A shortage throws here and rolls the whole merge back.
      await this.assertStockAllows(
        tx,
        userCart.id,
        new Set(merged.map((line) => line.offerId)),
      );
    });

    return this.buildView(userCart.id, currency);
  }

  /**
   * The persisted state of the named lines in the user's active cart, as a
   * checkout receipt. Lines that are not (or no longer) there are left out;
   * the caller compares against what it priced.
   *
   * Rows come in the canonical allocation order — (createdAt, id) — that
   * checkout must reserve them in for its result to match the cart's stock
   * check. `createdAt` is for that ordering only and is not persisted.
   */
  async getCheckoutSnapshot(
    userId: string,
    itemIds: string[],
  ): Promise<CheckoutCartSnapshotRow[]> {
    if (!itemIds.length) return [];

    return this.prisma.cartItem.findMany({
      where: {
        id: { in: itemIds },
        cart: { userId, status: CartStatus.ACTIVE },
      },
      select: {
        id: true,
        offerId: true,
        quantity: true,
        revision: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Called inside the order transaction: locks the user's active cart row and
   * confirms every snapshot line is still exactly as checkout priced it. The
   * lock is held until the order commits, so the cart cannot change between
   * this check and the order that consumes it.
   */
  async lockAndVerifyCheckoutSnapshot(
    tx: Prisma.TransactionClient,
    userId: string,
    snapshot: CheckoutCartSnapshotLine[],
  ): Promise<void> {
    const changed = (): ConflictException =>
      new ConflictException(
        'Cart changed; review your cart and check out again',
      );

    const cart = await tx.cart.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!cart || !(await this.lockActiveCart(tx, cart.id))) throw changed();

    const rows = await tx.cartItem.findMany({
      where: { cartId: cart.id, id: { in: snapshot.map((line) => line.id) } },
      select: { id: true, offerId: true, quantity: true, revision: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    for (const line of snapshot) {
      const row = byId.get(line.id);
      if (
        !row ||
        row.offerId !== line.offerId ||
        row.quantity !== line.quantity ||
        row.revision !== line.revision
      ) {
        throw changed();
      }
    }
  }

  /**
   * Removes the cart lines an order consumed, once its payment is known to
   * have been submitted. Only lines still exactly as checked out (same id,
   * quantity and revision) go: a line edited or re-added since — even back
   * to the same quantity — is kept. Idempotent, so the inline attempt and the
   * durable job may both run. Throws while the outcome is still unknown, so
   * the job retries.
   */
  async cleanUpCheckout(userId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        status: true,
        checkoutCartSnapshot: true,
        payment: { select: { status: true, providerReference: true } },
      },
    });

    // The order went with its user (and so did the cart).
    if (!order) return;
    if (!order.payment) {
      // Only an order still awaiting payment can yet gain a payment row; one
      // that is cancelled (or otherwise moved on) never will, so the shopper
      // keeps their cart.
      if (order.status !== OrderStatus.PENDING_PAYMENT) return;
      throw new Error(`Payment for order ${orderId} is not yet recorded`);
    }
    if (
      order.payment.status === PaymentStatus.FAILED ||
      order.payment.status === PaymentStatus.CANCELLED
    ) {
      return;
    }
    if (
      !order.payment.providerReference &&
      order.payment.status !== PaymentStatus.SUCCEEDED
    ) {
      throw new Error(
        `Payment for order ${orderId} awaits reconciliation before cart cleanup`,
      );
    }

    // Orders from before checkout receipts existed have no safe way to tell
    // their lines from ones added later, so their carts are left alone.
    const lines = this.parseSnapshot(order.checkoutCartSnapshot);
    if (!lines?.length) return;

    await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!cart) return;

      await this.lockCarts(tx, [cart.id]);
      await tx.cartItem.deleteMany({
        where: {
          cartId: cart.id,
          OR: lines.map(({ id, quantity, revision }) => ({
            id,
            quantity,
            revision,
          })),
        },
      });
    });
  }

  /**
   * Reads the deletion receipt out of an order's snapshot. Only id, quantity
   * and revision are needed to match a line, so entries without offerId —
   * written by the first draft of checkout receipts — still count.
   */
  private parseSnapshot(
    value: Prisma.JsonValue | null,
  ): CleanupReceiptLine[] | null {
    if (!Array.isArray(value)) return null;

    return value.filter(
      (entry): entry is CleanupReceiptLine =>
        !!entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        typeof entry.id === 'string' &&
        Number.isInteger(entry.quantity) &&
        Number.isInteger(entry.revision),
    );
  }

  /**
   * Runs one cart mutation in a single transaction holding the cart row lock,
   * after confirming the cart is still ACTIVE under that lock.
   */
  private withActiveCart<T>(
    cartId: string,
    execute: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockActiveCart(tx, cartId))) {
        throw new ConflictException('Cart is no longer active');
      }
      return execute(tx);
    });
  }

  /** Locks the cart row, then rereads it; null once it is no longer ACTIVE. */
  private async lockActiveCart(
    tx: Prisma.TransactionClient,
    cartId: string,
  ): Promise<Cart | null> {
    await this.lockCarts(tx, [cartId]);
    const cart = await tx.cart.findUnique({ where: { id: cartId } });
    return cart?.status === CartStatus.ACTIVE ? cart : null;
  }

  /** Cart rows are always locked in ascending id (see the global lock order). */
  private async lockCarts(
    tx: Prisma.TransactionClient,
    cartIds: string[],
  ): Promise<void> {
    for (const id of [...new Set(cartIds)].sort()) {
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${id}::uuid FOR UPDATE`;
    }
  }

  private assertQuantityFits(quantity: number): void {
    if (quantity > MAX_INT4) {
      throw new ConflictException('Cart quantity is too large');
    }
  }

  /**
   * Refuses a mutation that leaves the cart wanting more than checkout could
   * reserve. Runs after the writes, under the cart lock, so a shortage throws
   * and rolls the whole mutation back. Only pools holding one of `increased`
   * are checked — decreases and removals always go through, even on a cart
   * that is already short because stock fell.
   *
   * Stock is read without locks: a cart never reserves anything, and checkout
   * re-checks authoritatively. The demands are allocated the way checkout
   * would, each line to the first record that can serve it whole, in the
   * canonical (createdAt, id) order checkout reserves in. The lines are read
   * back after this mutation's writes, so a line added just now is ordered by
   * the createdAt it was actually stored with (normally last) — the same
   * value checkout will order it by.
   */
  private async assertStockAllows(
    tx: Prisma.TransactionClient,
    cartId: string,
    increased: Set<string>,
  ): Promise<void> {
    const items = await tx.cartItem.findMany({
      where: { cartId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const offerById = new Map(
      (
        await this.offers.findMany(
          items.map((item) => item.offerId),
          tx,
        )
      ).map((offer) => [offer.id, offer]),
    );

    const pools = new Map<
      string,
      { pool: StockPoolKey; demands: number[]; increasedOfferId?: string }
    >();
    for (const item of items) {
      const offer = offerById.get(item.offerId);
      if (!offer) continue;

      const pool: StockPoolKey =
        offer.stockSource === OfferStockSource.SELLER
          ? { kind: 'offer', offerId: offer.id }
          : { kind: 'variant', variantId: offer.variantId };
      const key = stockPoolKey(pool);
      const entry = pools.get(key) ?? { pool, demands: [] };
      entry.demands.push(item.quantity);
      if (increased.has(item.offerId)) entry.increasedOfferId ??= item.offerId;
      pools.set(key, entry);
    }

    const checked = [...pools.values()].filter(
      (entry) => entry.increasedOfferId,
    );
    if (!checked.length) return;

    const stock = await this.inventoryService.getAllocatableStock(
      checked.map((entry) => entry.pool),
      tx,
    );
    for (const entry of checked) {
      const available = stock.get(stockPoolKey(entry.pool)) ?? [];
      if (canAllocateFirstFit(available, entry.demands)) continue;

      throw new ConflictException({
        message: 'Requested quantity exceeds available stock',
        details: [
          { field: 'offerId', message: entry.increasedOfferId },
          {
            field: 'available',
            message: String(available.reduce((sum, value) => sum + value, 0)),
          },
        ],
      });
    }
  }

  private async getOrCreateCart(
    identity: CartIdentity,
  ): Promise<{ cart: Cart; newGuestToken?: string }> {
    const existing = await this.findCart(identity);

    if (existing) {
      return { cart: existing };
    }

    if (identity.userId) {
      return { cart: await this.getOrCreateUserCart(identity.userId) };
    }

    const guestToken = generateGuestToken();
    const cart = await this.prisma.cart.create({ data: { guestToken } });
    return { cart, newGuestToken: guestToken };
  }

  /**
   * Concurrent first adds for one user serialize on the users row, so exactly
   * one creates the cart and the rest find it. The unique userId index stays
   * the backstop for any writer that does not take the lock.
   */
  private async getOrCreateUserCart(userId: string): Promise<Cart> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        return (
          (await tx.cart.findUnique({ where: { userId } })) ??
          (await tx.cart.create({ data: { userId } }))
        );
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      return this.prisma.cart.findUniqueOrThrow({ where: { userId } });
    }
  }

  private findCart(identity: CartIdentity): Promise<Cart | null> {
    // findFirst, not findUnique: a MERGED guest cart keeps its (unique)
    // guestToken forever, but must stop resolving once merged — otherwise a
    // client that keeps presenting a stale guest token would keep seeing (and
    // could keep mutating) a cart that's supposed to be dead.
    if (identity.userId) {
      return this.prisma.cart.findFirst({
        where: { userId: identity.userId, status: CartStatus.ACTIVE },
      });
    }

    if (identity.guestToken) {
      return this.prisma.cart.findFirst({
        where: { guestToken: identity.guestToken, status: CartStatus.ACTIVE },
      });
    }

    return Promise.resolve(null);
  }

  private async findCartOrThrow(identity: CartIdentity): Promise<Cart> {
    const cart = await this.findCart(identity);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    return cart;
  }

  private async buildView(cartId: string, currency: string): Promise<CartView> {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: { items: true },
    });

    if (!cart) {
      return this.emptyView(currency);
    }

    const offers = await this.offers.findMany(
      cart.items.map((item) => item.offerId),
    );
    const byId = new Map(offers.map((offer) => [offer.id, offer]));
    const quantities = await this.inventoryService.getAvailableQuantities(
      offers
        .filter((offer) => offer.stockSource !== OfferStockSource.SELLER)
        .map((offer) => offer.variantId),
    );
    const offerQuantities =
      await this.inventoryService.getAvailableOfferQuantities(
        offers
          .filter((offer) => offer.stockSource === OfferStockSource.SELLER)
          .map((offer) => offer.id),
      );
    const lines: CartLineView[] = cart.items.map((item) =>
      this.toLineView(item, byId, quantities, offerQuantities, currency),
    );

    const subtotal = lines
      .filter((line) => line.isAvailable)
      .reduce((sum, line) => sum + line.lineTotal, 0);

    // The cart is denominated in what the shopper is browsing in, not in
    // whatever the first line happens to carry — otherwise a cart holding
    // nothing priced in their currency would report someone else's.
    return { id: cart.id, items: lines, subtotal, currency };
  }

  private emptyView(currency: string): CartView {
    return { id: null, items: [], subtotal: 0, currency };
  }

  private toLineView(
    item: { id: string; offerId: string; quantity: number },
    offerById: Map<string, CommerceOffer>,
    quantities: Map<string, number>,
    offerQuantities: Map<string, number>,
    currency: string,
  ): CartLineView {
    const offer = offerById.get(item.offerId);
    const currentPrice = pickCurrentPrice(offer?.prices ?? [], currency);
    const sellerStock = offer?.stockSource === OfferStockSource.SELLER;
    const availableQuantity = offer
      ? sellerStock
        ? (offerQuantities.get(offer.id) ?? 0)
        : (quantities.get(offer.variantId) ?? 0)
      : 0;
    const sellerApproved =
      !!offer &&
      (!offer.sellerId || offer.seller?.status === SellerStatus.APPROVED);
    const isAvailable =
      sellerApproved &&
      offer?.status === ProductStatus.PUBLISHED &&
      !!currentPrice &&
      availableQuantity >= item.quantity;
    return {
      id: item.id,
      offerId: item.offerId,
      sellerId: offer?.sellerId ?? null,
      quantity: item.quantity,
      unitPrice: currentPrice
        ? { amount: currentPrice.amount, currency: currentPrice.currency }
        : null,
      lineTotal:
        isAvailable && currentPrice ? currentPrice.amount * item.quantity : 0,
      isAvailable,
      // What it is priced in, so a client can tell "we stopped selling this"
      // apart from "we don't sell this in the currency you are browsing".
      currencies: currentPrices(offer?.prices ?? [])
        .map((price) => price.currency)
        .sort(),
    };
  }
}
