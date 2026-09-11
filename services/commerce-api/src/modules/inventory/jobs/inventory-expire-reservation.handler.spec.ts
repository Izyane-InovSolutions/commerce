import { InventoryService } from '../inventory.service';
import { InventoryExpireReservationHandler } from './inventory-expire-reservation.handler';

describe('InventoryExpireReservationHandler', () => {
  let inventoryService: { expireReservation: jest.Mock };
  let handler: InventoryExpireReservationHandler;

  beforeEach(() => {
    inventoryService = {
      expireReservation: jest.fn().mockResolvedValue(undefined),
    };
    handler = new InventoryExpireReservationHandler(
      inventoryService as unknown as InventoryService,
    );
  });

  it('has the job type this handler is registered under', () => {
    expect(handler.type).toBe('inventory.expire_reservation');
  });

  it('calls InventoryService.expireReservation with the payload reservation id', async () => {
    await handler.handle({ reservationId: 'reservation-1' });

    expect(inventoryService.expireReservation).toHaveBeenCalledWith(
      'reservation-1',
    );
  });

  it('throws on a payload missing reservationId', async () => {
    await expect(handler.handle({})).rejects.toThrow(
      'Malformed inventory.expire_reservation payload',
    );
    expect(inventoryService.expireReservation).not.toHaveBeenCalled();
  });

  it('throws on a non-object payload', async () => {
    await expect(handler.handle('not-an-object')).rejects.toThrow(
      'Malformed inventory.expire_reservation payload',
    );
  });
});
