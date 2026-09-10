import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { AddressesService } from '../users/addresses/addresses.service';
import { CartService } from '../cart/cart.service';
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
} {
  return {
    offer: { findMany: jest.fn() },
    order: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    orderItem: { update: jest.fn(), findUnique: jest.fn() },
  };
}

describe('OrdersService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let cartService: { getCartView: jest.Mock; clearCart: jest.Mock };
  let inventoryService: {
    reserve: jest.Mock;
    commit: jest.Mock;
    release: jest.Mock;
  };
  let addressesService: { findOne: jest.Mock };
  let service: OrdersService;

  const cartLine = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    offerId: 'offer-1',
    quantity: 2,
    unitPrice: { amount: 1000, currency: 'USD' },
    lineTotal: 2000,
    isAvailable: true,
    ...overrides,
  });

  beforeEach(() => {
    prisma = buildPrisma();
    cartService = { getCartView: jest.fn(), clearCart: jest.fn() };
    inventoryService = {
      reserve: jest.fn(),
      commit: jest.fn(),
      release: jest.fn(),
    };
    addressesService = { findOne: jest.fn() };
    service = new OrdersService(
      prisma as unknown as PrismaService,
      cartService as unknown as CartService,
      inventoryService as unknown as InventoryService,
      addressesService as unknown as AddressesService,
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
      addressesService.findOne.mockResolvedValue({
        label: null,
        recipientName: 'Jane',
        phone: null,
        line1: '1 Main St',
        line2: null,
        city: 'Metropolis',
        region: null,
        postalCode: '12345',
        country: 'US',
      });
      prisma.offer.findMany.mockResolvedValue([
        { id: 'offer-1', variantId: 'variant-1' },
      ]);
      prisma.order.create.mockResolvedValue({
        id: 'order-1',
        items: [{ id: 'item-1', offerId: 'offer-1', quantity: 2 }],
      });
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
      addressesService.findOne.mockResolvedValue({
        label: null,
        recipientName: 'Jane',
        phone: null,
        line1: '1 Main St',
        line2: null,
        city: 'Metropolis',
        region: null,
        postalCode: '12345',
        country: 'US',
      });
      prisma.offer.findMany.mockResolvedValue([
        { id: 'offer-1', variantId: 'variant-1' },
        { id: 'offer-2', variantId: 'variant-2' },
      ]);
      prisma.order.create.mockResolvedValue({
        id: 'order-1',
        items: [
          { id: 'item-1', offerId: 'offer-1', quantity: 2 },
          { id: 'item-2', offerId: 'offer-2', quantity: 2 },
        ],
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
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.CANCELLED },
      });
    });
  });

  describe('confirmPayment', () => {
    it('commits every reservation and marks the order PAID', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [{ id: 'item-1', reservationId: 'reservation-1' }],
      });

      await service.confirmPayment('order-1');

      expect(inventoryService.commit).toHaveBeenCalledWith('reservation-1');
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.PAID },
      });
    });
  });

  describe('cancel', () => {
    it('releases every reservation and marks the order CANCELLED', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        items: [{ id: 'item-1', reservationId: 'reservation-1' }],
      });

      await service.cancel('order-1');

      expect(inventoryService.release).toHaveBeenCalledWith('reservation-1');
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
