import { Logger } from '@nestjs/common';

import { CartService } from '../cart.service';
import { CartCleanupHandler } from './cart-cleanup.handler';

describe('CartCleanupHandler', () => {
  let cartService: {
    cleanUpCheckout: jest.Mock;
    clearCart: jest.Mock;
    removeItems: jest.Mock;
  };
  let handler: CartCleanupHandler;

  beforeEach(() => {
    cartService = {
      cleanUpCheckout: jest.fn().mockResolvedValue(undefined),
      clearCart: jest.fn().mockResolvedValue(undefined),
      removeItems: jest.fn().mockResolvedValue(undefined),
    };
    handler = new CartCleanupHandler(cartService as unknown as CartService);
  });

  it('has the job type this handler is registered under', () => {
    expect(handler.type).toBe('cart.cleanup_items');
  });

  it('cleans up against the order receipt when an orderId is given', async () => {
    await handler.handle({ userId: 'user-1', orderId: 'order-1' });

    expect(cartService.cleanUpCheckout).toHaveBeenCalledWith(
      'user-1',
      'order-1',
    );
  });

  it.each([
    ['no itemIds', { userId: 'user-1' }],
    ['empty itemIds', { userId: 'user-1', itemIds: [] }],
    ['named itemIds', { userId: 'user-1', itemIds: ['item-1', 'item-2'] }],
  ])(
    'deletes nothing for a legacy payload with %s',
    async (_label, payload) => {
      await handler.handle(payload);

      expect(cartService.cleanUpCheckout).not.toHaveBeenCalled();
      expect(cartService.clearCart).not.toHaveBeenCalled();
      expect(cartService.removeItems).not.toHaveBeenCalled();
    },
  );

  it('completes a legacy job and says so in the log', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await expect(
      handler.handle({ userId: 'user-1', itemIds: ['item-1'] }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      'Skipping legacy cart cleanup job without an orderId',
    );
    warn.mockRestore();
  });

  it('prefers the order receipt when a payload carries both orderId and itemIds', async () => {
    await handler.handle({
      userId: 'user-1',
      orderId: 'order-1',
      itemIds: ['item-1'],
    });

    expect(cartService.cleanUpCheckout).toHaveBeenCalledWith(
      'user-1',
      'order-1',
    );
    expect(cartService.removeItems).not.toHaveBeenCalled();
    expect(cartService.clearCart).not.toHaveBeenCalled();
  });

  it('propagates a cleanup failure so the job retries', async () => {
    cartService.cleanUpCheckout.mockRejectedValue(new Error('not yet'));

    await expect(
      handler.handle({ userId: 'user-1', orderId: 'order-1' }),
    ).rejects.toThrow('not yet');
  });

  it('throws on a payload missing userId', async () => {
    await expect(handler.handle({})).rejects.toThrow(
      'Malformed cart.cleanup_items payload',
    );
    expect(cartService.cleanUpCheckout).not.toHaveBeenCalled();
  });

  it.each([
    ['a string', 'not-an-object'],
    ['null', null],
    ['an array', [{ userId: 'user-1', orderId: 'order-1' }]],
    ['a numeric userId', { userId: 7, orderId: 'order-1' }],
  ])('throws on %s payload', async (_label, payload) => {
    await expect(handler.handle(payload)).rejects.toThrow(
      'Malformed cart.cleanup_items payload',
    );
    expect(cartService.cleanUpCheckout).not.toHaveBeenCalled();
  });

  it('throws when orderId is not a string', async () => {
    await expect(
      handler.handle({ userId: 'user-1', orderId: 42 }),
    ).rejects.toThrow('orderId must be a string');
  });

  it('throws when itemIds is not a string array', async () => {
    await expect(
      handler.handle({ userId: 'user-1', itemIds: [1, 2] }),
    ).rejects.toThrow('itemIds must be a string array');
  });
});
