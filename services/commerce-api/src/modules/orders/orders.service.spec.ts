import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { AddressesService } from '../users/addresses/addresses.service';
import { CartService } from '../cart/cart.service';
import { LedgerService } from '../financials/ledger.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from './orders.service';

function buildPrisma(): {
  offer: { findMany: jest.Mock };
  order: {
    create: jest.Mock;
    update: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  orderItem: { update: jest.Mock; findUnique: jest.Mock };
  sellerOrder: {
    create: jest.Mock;
    updateMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
} {
  const prisma = {
    offer: { findMany: jest.fn() },
    order: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    orderItem: { update: jest.fn(), findUnique: jest.fn() },
    sellerOrder: {
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => unknown) => callback(prisma),
  );
  return prisma;
}

function cartLine(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    offerId: 'offer-1',
    sellerId: null,
    quantity: 2,
    unitPrice: { amount: 1000, currency: 'USD' },
    lineTotal: 2000,
    isAvailable: true,
    ...overrides,
  };
}

describe('OrdersService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let cartService: { getCartView: jest.Mock; clearCart: jest.Mock };
  let inventoryService: {
    reserve: jest.Mock;
    commit: jest.Mock;
    release: jest.Mock;
    restock: jest.Mock;
  };
  let addressesService: { findOne: jest.Mock };
  let ledgerService: { recordSale: jest.Mock };
  let service: OrdersService;

  const address = {
    label: null,
    recipientName: 'Jane',
    phone: null,
    line1: '1 Main St',
    line2: null,
    city: 'Metropolis',
    region: null,
    postalCode: '12345',
    country: 'US',
  };

  beforeEach(() => {
    prisma = buildPrisma();
    cartService = { getCartView: jest.fn(), clearCart: jest.fn() };
    inventoryService = {
      reserve: jest.fn(),
      commit: jest.fn(),
      release: jest.fn(),
      restock: jest.fn(),
    };
    addressesService = { findOne: jest.fn().mockResolvedValue(address) };
    ledgerService = { recordSale: jest.fn().mockResolvedValue(undefined) };
    service = new OrdersService(
      prisma as unknown as PrismaService,
      cartService as unknown as CartService,
      inventoryService as unknown as InventoryService,
      addressesService as unknown as AddressesService,
      ledgerService as unknown as LedgerService,
    );
  });

  describe('createFromCart', () => {
    it('rejects an empty cart', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [],
        subtotal: 0,
        currency: null,
      });

      await expect(
        service.createFromCart('user-1', 'addr-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a cart with an unavailable line', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [cartLine({ isAvailable: false })],
        subtotal: 2000,
        currency: 'USD',
      });

      await expect(
        service.createFromCart('user-1', 'addr-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the order, reserves stock per line, and returns it', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [cartLine()],
        subtotal: 2000,
        currency: 'USD',
      });
      prisma.offer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          variantId: 'variant-1',
          sellerId: null,
          stockSource: 'PLATFORM',
        },
      ]);
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      inventoryService.reserve.mockResolvedValue({ id: 'reservation-1' });
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [
          {
            id: 'item-1',
            offerId: 'offer-1',
            quantity: 2,
            reservationId: 'reservation-1',
          },
        ],
        sellerOrders: [
          {
            id: 'seller-order-1',
            sellerId: null,
            items: [{ id: 'item-1', offerId: 'offer-1', quantity: 2 }],
          },
        ],
      });

      const order = await service.createFromCart('user-1', 'addr-1');

      expect(inventoryService.reserve).toHaveBeenCalledWith('variant-1', 2, {
        holderType: 'order_item',
        holderId: 'item-1',
      });
      expect(prisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { reservationId: 'reservation-1' },
      });
      expect(order.id).toBe('order-1');
      expect(order.sellerOrders).toHaveLength(1);
    });

    it('splits a cart spanning first-party and two sellers into one SellerOrder per group', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [
          cartLine({
            offerId: 'offer-1',
            sellerId: null,
            quantity: 1,
            lineTotal: 1000,
          }),
          cartLine({
            offerId: 'offer-2',
            sellerId: 'seller-a',
            quantity: 1,
            lineTotal: 1000,
          }),
          cartLine({
            offerId: 'offer-3',
            sellerId: 'seller-b',
            quantity: 1,
            lineTotal: 1000,
          }),
        ],
        subtotal: 3000,
        currency: 'USD',
      });
      prisma.offer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          variantId: 'variant-1',
          sellerId: null,
          stockSource: 'PLATFORM',
        },
        {
          id: 'offer-2',
          variantId: 'variant-2',
          sellerId: 'seller-a',
          stockSource: 'SELLER',
        },
        {
          id: 'offer-3',
          variantId: 'variant-3',
          sellerId: 'seller-b',
          stockSource: 'SELLER',
        },
      ]);
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      inventoryService.reserve.mockResolvedValue({ id: 'reservation-1' });
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [
          {
            id: 'item-1',
            offerId: 'offer-1',
            quantity: 1,
            reservationId: 'reservation-1',
          },
          {
            id: 'item-2',
            offerId: 'offer-2',
            quantity: 1,
            reservationId: null,
          },
          {
            id: 'item-3',
            offerId: 'offer-3',
            quantity: 1,
            reservationId: null,
          },
        ],
        sellerOrders: [
          { id: 'so-platform', sellerId: null, items: [] },
          { id: 'so-a', sellerId: 'seller-a', items: [] },
          { id: 'so-b', sellerId: 'seller-b', items: [] },
        ],
      });

      const order = await service.createFromCart('user-1', 'addr-1');

      expect(prisma.sellerOrder.create).toHaveBeenCalledTimes(3);
      // Only the PLATFORM-stockSource item is reserved - SELLER-stockSource
      // items have no backing inventory model yet (#33).
      expect(inventoryService.reserve).toHaveBeenCalledTimes(1);
      expect(inventoryService.reserve).toHaveBeenCalledWith('variant-1', 1, {
        holderType: 'order_item',
        holderId: 'item-1',
      });
      expect(order.sellerOrders).toHaveLength(3);
    });

    it('compensates already-reserved lines and cancels the order when a later reservation fails', async () => {
      cartService.getCartView.mockResolvedValue({
        items: [
          cartLine({ offerId: 'offer-1' }),
          cartLine({ offerId: 'offer-2' }),
        ],
        subtotal: 4000,
        currency: 'USD',
      });
      prisma.offer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          variantId: 'variant-1',
          sellerId: null,
          stockSource: 'PLATFORM',
        },
        {
          id: 'offer-2',
          variantId: 'variant-2',
          sellerId: null,
          stockSource: 'PLATFORM',
        },
      ]);
      prisma.order.create.mockResolvedValue({ id: 'order-1' });
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [
          { id: 'item-1', offerId: 'offer-1', quantity: 2 },
          { id: 'item-2', offerId: 'offer-2', quantity: 2 },
        ],
        sellerOrders: [{ id: 'so-1', sellerId: null, items: [] }],
      });
      inventoryService.reserve
        .mockResolvedValueOnce({ id: 'reservation-1' })
        .mockRejectedValueOnce(
          new ConflictException('Insufficient available stock'),
        );
      prisma.orderItem.findUnique.mockResolvedValue({
        id: 'item-1',
        reservationId: 'reservation-1',
      });

      await expect(
        service.createFromCart('user-1', 'addr-1'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(inventoryService.release).toHaveBeenCalledWith('reservation-1');
      expect(prisma.sellerOrder.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        data: { status: OrderStatus.CANCELLED },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.CANCELLED },
      });
    });
  });

  describe('confirmPayment', () => {
    it('commits every reservation, marks the order and every SellerOrder PAID, and records a sale per seller order', async () => {
      const platformGroup = { id: 'so-platform', sellerId: null, total: 1000 };
      const sellerGroup = { id: 'so-a', sellerId: 'seller-a', total: 2000 };
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [{ id: 'item-1', reservationId: 'reservation-1' }],
        sellerOrders: [platformGroup, sellerGroup],
      });

      await service.confirmPayment('order-1');

      expect(inventoryService.commit).toHaveBeenCalledWith('reservation-1');
      expect(prisma.sellerOrder.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        data: { status: OrderStatus.PAID },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.PAID },
      });
      expect(ledgerService.recordSale).toHaveBeenCalledWith(platformGroup);
      expect(ledgerService.recordSale).toHaveBeenCalledWith(sellerGroup);
      expect(ledgerService.recordSale).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSellerOrderForPayment', () => {
    it('throws not found when the seller order does not exist', async () => {
      prisma.sellerOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.getSellerOrderForPayment('so-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a seller order that is not paid or partially refunded', async () => {
      prisma.sellerOrder.findUnique.mockResolvedValue({
        id: 'so-1',
        status: OrderStatus.PENDING_PAYMENT,
      });

      await expect(
        service.getSellerOrderForPayment('so-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns a PAID seller order', async () => {
      const sellerOrder = { id: 'so-1', status: OrderStatus.PAID };
      prisma.sellerOrder.findUnique.mockResolvedValue(sellerOrder);

      await expect(service.getSellerOrderForPayment('so-1')).resolves.toBe(
        sellerOrder,
      );
    });
  });

  describe('applyRefund', () => {
    it('rejects a refund amount exceeding the remaining refundable balance', async () => {
      prisma.sellerOrder.findUnique.mockResolvedValue({
        id: 'so-1',
        total: 1000,
        refundedAmount: 900,
        items: [],
      });

      await expect(service.applyRefund('so-1', 200)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('marks PARTIALLY_REFUNDED and does not restock when not fully refunded', async () => {
      prisma.sellerOrder.findUnique.mockResolvedValue({
        id: 'so-1',
        total: 1000,
        refundedAmount: 0,
        items: [{ id: 'item-1', reservationId: 'reservation-1' }],
      });
      prisma.sellerOrder.update.mockResolvedValue({
        id: 'so-1',
        status: OrderStatus.PARTIALLY_REFUNDED,
      });

      await service.applyRefund('so-1', 400);

      expect(prisma.sellerOrder.update).toHaveBeenCalledWith({
        where: { id: 'so-1' },
        data: { refundedAmount: 400, status: OrderStatus.PARTIALLY_REFUNDED },
      });
      expect(inventoryService.restock).not.toHaveBeenCalled();
    });

    it('marks REFUNDED and restocks every reserved item once fully refunded', async () => {
      prisma.sellerOrder.findUnique.mockResolvedValue({
        id: 'so-1',
        total: 1000,
        refundedAmount: 600,
        items: [
          { id: 'item-1', reservationId: 'reservation-1' },
          { id: 'item-2', reservationId: null },
        ],
      });
      prisma.sellerOrder.update.mockResolvedValue({
        id: 'so-1',
        status: OrderStatus.REFUNDED,
      });

      await service.applyRefund('so-1', 400);

      expect(prisma.sellerOrder.update).toHaveBeenCalledWith({
        where: { id: 'so-1' },
        data: { refundedAmount: 1000, status: OrderStatus.REFUNDED },
      });
      expect(inventoryService.restock).toHaveBeenCalledWith('reservation-1');
      expect(inventoryService.restock).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancel', () => {
    it('releases every reservation and marks the order and every SellerOrder CANCELLED', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [{ id: 'item-1', reservationId: 'reservation-1' }],
      });

      await service.cancel('order-1');

      expect(inventoryService.release).toHaveBeenCalledWith('reservation-1');
      expect(prisma.sellerOrder.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        data: { status: OrderStatus.CANCELLED },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.CANCELLED },
      });
    });
  });

  describe('findOwn', () => {
    it('throws not found when the order belongs to someone else', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        userId: 'someone-else',
        items: [],
      });

      await expect(service.findOwn('user-1', 'order-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
