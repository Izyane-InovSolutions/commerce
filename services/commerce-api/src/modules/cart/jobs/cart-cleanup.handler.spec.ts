import { CartService } from '../cart.service';
import { CartCleanupHandler } from './cart-cleanup.handler';

describe('CartCleanupHandler', () => {
  let cartService: { clearCart: jest.Mock; removeItems: jest.Mock };
  let handler: CartCleanupHandler;

  beforeEach(() => {
    cartService = {
      clearCart: jest.fn().mockResolvedValue(undefined),
      removeItems: jest.fn().mockResolvedValue(undefined),
    };
    handler = new CartCleanupHandler(cartService as unknown as CartService);
  });

  it('has the job type this handler is registered under', () => {
    expect(handler.type).toBe('cart.cleanup_items');
  });

  it('clears the whole cart when no itemIds are given', async () => {
    await handler.handle({ userId: 'user-1' });

    expect(cartService.clearCart).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(cartService.removeItems).not.toHaveBeenCalled();
  });

  it('clears the whole cart when itemIds is an empty array', async () => {
    await handler.handle({ userId: 'user-1', itemIds: [] });

    expect(cartService.clearCart).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(cartService.removeItems).not.toHaveBeenCalled();
  });

  it('removes only the named lines when itemIds is non-empty', async () => {
    await handler.handle({ userId: 'user-1', itemIds: ['item-1', 'item-2'] });

    expect(cartService.removeItems).toHaveBeenCalledWith({ userId: 'user-1' }, [
      'item-1',
      'item-2',
    ]);
    expect(cartService.clearCart).not.toHaveBeenCalled();
  });

  it('throws on a payload missing userId', async () => {
    await expect(handler.handle({})).rejects.toThrow(
      'Malformed cart.cleanup_items payload',
    );
    expect(cartService.clearCart).not.toHaveBeenCalled();
  });

  it('throws on a non-object payload', async () => {
    await expect(handler.handle('not-an-object')).rejects.toThrow(
      'Malformed cart.cleanup_items payload',
    );
  });

  it('throws when itemIds is not a string array', async () => {
    await expect(
      handler.handle({ userId: 'user-1', itemIds: [1, 2] }),
    ).rejects.toThrow('itemIds must be a string array');
  });
});
