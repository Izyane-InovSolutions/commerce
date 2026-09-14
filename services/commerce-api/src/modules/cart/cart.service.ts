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

    await this.prisma.cartItem.upsert({
      where: { cartId_offerId: { cartId: cart.id, offerId } },
      create: { cartId: cart.id, offerId, quantity },
      update: { quantity: { increment: quantity } },
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
    await this.findItemOrThrow(cart.id, itemId);

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });

    return this.buildView(cart.id, currency);
  }

  async removeItem(
    identity: CartIdentity,
    itemId: string,
    currency: string,
  ): Promise<CartView> {
    const cart = await this.findCartOrThrow(identity);
    await this.findItemOrThrow(cart.id, itemId);

    await this.prisma.cartItem.delete({ where: { id: itemId } });

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
    const quantities =
      offer && offer.stockSource !== OfferStockSource.SELLER
        ? await this.inventoryService.getAvailableQuantities([
            offer.variantId,
          ])
        : new Map<string, number>();

    return this.toLineView(
      { id: `buy-now:${offerId}`, offerId, quantity },
      offerById,
      quantities,
      currency,
    );
  }

  async clearCart(identity: CartIdentity): Promise<void> {
    const cart = await this.findCart(identity);

    if (!cart) {
      return;
    }

    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }

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
      include: { items: true },
    });

    if (!guestCart || guestCart.status !== CartStatus.ACTIVE) {
      return this.getCartView({ userId }, currency);
    }

    const { cart: userCart } = await this.getOrCreateCart({ userId });

    await this.prisma.$transaction(async (tx) => {
      for (const item of guestCart.items) {
        await tx.cartItem.upsert({
          where: {
            cartId_offerId: { cartId: userCart.id, offerId: item.offerId },
          },
          create: {
            cartId: userCart.id,
            offerId: item.offerId,
            quantity: item.quantity,
          },
          update: { quantity: { increment: item.quantity } },
        });
      }

      await tx.cart.update({
        where: { id: guestCart.id },
        data: { status: CartStatus.MERGED },
      });
    });

    return this.buildView(userCart.id, currency);
  }

  private async getOrCreateCart(
    identity: CartIdentity,
  ): Promise<{ cart: Cart; newGuestToken?: string }> {
    const existing = await this.findCart(identity);

    if (existing) {
      return { cart: existing };
    }

    if (identity.userId) {
      const cart = await this.prisma.cart.create({
        data: { userId: identity.userId },
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
    const lines: CartLineView[] = cart.items.map((item) =>
      this.toLineView(item, byId, quantities, currency),
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
    currency: string,
  ): CartLineView {
    const offer = offerById.get(item.offerId);
    const currentPrice = pickCurrentPrice(offer?.prices ?? [], currency);
    const sellerStock = offer?.stockSource === OfferStockSource.SELLER;
    const availableQuantity = offer
      ? (quantities.get(offer.variantId) ?? 0)
      : 0;
    const sellerApproved =
      !!offer &&
      (!offer.sellerId || offer.seller?.status === SellerStatus.APPROVED);
    const isAvailable =
      sellerApproved &&
      offer?.status === ProductStatus.PUBLISHED &&
      !!currentPrice &&
      (sellerStock || availableQuantity >= item.quantity);
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
