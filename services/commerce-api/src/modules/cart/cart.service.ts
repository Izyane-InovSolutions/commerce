import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CartStatus,
  OfferStockSource,
  ProductStatus,
  SellerStatus,
  type Cart,
  type CartItem,
  type Prisma,
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
  AddItemResult,
  CartIdentity,
  CartLineView,
  CartView,
} from './cart.types';
import { generateGuestToken } from './guest-token.util';

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

    await this.withActiveCart(cart.id, async (tx) => tx.cartItem.upsert({
      where: { cartId_offerId: { cartId: cart.id, offerId } },
      create: { cartId: cart.id, offerId, quantity },
      update: { quantity: { increment: quantity }, revision: { increment: 1 } },
    }));

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
      const changed = await tx.cartItem.updateMany({
        where: { id: itemId, cartId: cart.id },
        data: { quantity, revision: { increment: 1 } },
      });
      if (!changed.count) throw new NotFoundException('Cart item not found');
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
      const removed = await tx.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
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

    await this.withActiveCart(cart.id, (tx) => tx.cartItem.deleteMany({ where: { cartId: cart.id } }));
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

    await this.withActiveCart(cart.id, (tx) => tx.cartItem.deleteMany({
      where: { cartId: cart.id, id: { in: itemIds } },
    }));
  }

  async mergeGuestCart(
    userId: string,
    guestToken: string | undefined,
    currency: string,
  ): Promise<CartView> {
    if (!guestToken) {
      return this.getCartView({ userId }, currency);
    }

    const guestCart = await this.prisma.cart.findUnique({ where: { guestToken } });
    if (!guestCart || guestCart.status !== CartStatus.ACTIVE)
      return this.getCartView({ userId }, currency);
    const { cart: userCart } = await this.getOrCreateCart({ userId });
    await this.prisma.$transaction(async (tx) => {
      for (const id of [guestCart.id, userCart.id].sort())
        await tx.$queryRaw`SELECT id FROM carts WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.cart.findUniqueOrThrow({
        where: { id: guestCart.id }, include: { items: true },
      });
      if (current.status !== CartStatus.ACTIVE) return;
      for (const item of current.items.sort((a, b) => a.offerId.localeCompare(b.offerId))) {
        await tx.cartItem.upsert({
          where: { cartId_offerId: { cartId: userCart.id, offerId: item.offerId } },
          create: { cartId: userCart.id, offerId: item.offerId, quantity: item.quantity },
          update: { quantity: { increment: item.quantity }, revision: { increment: 1 } },
        });
      }
      await tx.cart.update({ where: { id: guestCart.id }, data: { status: CartStatus.MERGED } });
    });

    return this.buildView(userCart.id, currency);
  }

  /** A changed or recreated line is preserved, including same-quantity edits. */
  async cleanUpCheckout(userId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId }, select: { checkoutCartSnapshot: true, payment: { select: { status: true, providerReference: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.payment) throw new Error('Payment initialization is not yet recorded');
    if (['FAILED', 'CANCELLED'].includes(order.payment.status)) return;
    if (!order.payment.providerReference && order.payment.status !== 'SUCCEEDED')
      throw new Error('Payment initialization requires reconciliation');
    const snapshot = order.checkoutCartSnapshot;
    if (!Array.isArray(snapshot)) return; // Old orders have no safe cleanup receipt.
    for (const entry of snapshot) {
      const item = entry as { id: string; quantity: number; revision: number };
      await this.prisma.cartItem.deleteMany({ where: {
        id: item.id, quantity: item.quantity, revision: item.revision,
        cart: { userId },
      } });
    }
  }

  private withActiveCart<T>(id: string, execute: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${id}::uuid FOR UPDATE`;
      const cart = await tx.cart.findUnique({ where: { id } });
      if (!cart || cart.status !== CartStatus.ACTIVE)
        throw new NotFoundException('Cart is no longer active');
      return execute(tx);
    });
  }

  private async getOrCreateCart(
    identity: CartIdentity,
  ): Promise<{ cart: Cart; newGuestToken?: string }> {
    const existing = await this.findCart(identity);

    if (existing) {
      return { cart: existing };
    }

    if (identity.userId) {
      const cart = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${identity.userId}::uuid FOR UPDATE`;
        return (await tx.cart.findUnique({ where: { userId: identity.userId } }))
          ?? tx.cart.create({ data: { userId: identity.userId } });
      });
      return { cart };
    }

    const guestToken = generateGuestToken();
    const cart = await this.prisma.cart.create({ data: { guestToken } });
    return { cart, newGuestToken: guestToken };
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

  private async findItemOrThrow(
    cartId: string,
    itemId: string,
  ): Promise<CartItem> {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
    });

    if (!item || item.cartId !== cartId) {
      throw new NotFoundException('Cart item not found');
    }

    return item;
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
