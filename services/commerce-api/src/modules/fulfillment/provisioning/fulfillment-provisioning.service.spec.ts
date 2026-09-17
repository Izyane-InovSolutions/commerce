import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../../infrastructure/jobs/outbox.service';
import { NumberingService } from '../../../common/numbering/numbering.service';
import { AuditService } from '../../audit/audit.service';
import { FulfillmentProvisioningService } from './fulfillment-provisioning.service';

function buildTx(): {
  fulfillmentOrder: { create: jest.Mock };
  fulfillmentEvent: { create: jest.Mock };
} {
  return {
    fulfillmentOrder: { create: jest.fn() },
    fulfillmentEvent: { create: jest.fn() },
  };
}

function buildPrisma(): {
  order: { findUnique: jest.Mock };
  reservation: { findUnique: jest.Mock };
  inventoryRecord: { findUnique: jest.Mock };
  $transaction: jest.Mock;
  tx: ReturnType<typeof buildTx>;
} {
  const tx = buildTx();
  return {
    order: { findUnique: jest.fn() },
    reservation: { findUnique: jest.fn() },
    inventoryRecord: { findUnique: jest.fn() },
    $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
    tx,
  };
}

const SELLER_ORDER_ID = 'so-1';
const SHIPPING_GROUP_ID = 'sg-1';

function orderWithGroup(items: unknown[]): Record<string, unknown> {
  return {
    id: 'order-1',
    sellerOrders: [
      {
        id: SELLER_ORDER_ID,
        shippingGroups: [{ id: SHIPPING_GROUP_ID, items }],
      },
    ],
  };
}

describe('FulfillmentProvisioningService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let numberingService: { nextFulfillmentNumber: jest.Mock };
  let auditService: { record: jest.Mock };
  let outboxService: { record: jest.Mock };
  let service: FulfillmentProvisioningService;

  beforeEach(() => {
    prisma = buildPrisma();
    numberingService = {
      nextFulfillmentNumber: jest.fn().mockResolvedValue('FF-2026-000001'),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    outboxService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new FulfillmentProvisioningService(
      prisma as unknown as PrismaService,
      numberingService as unknown as NumberingService,
      auditService as unknown as AuditService,
      outboxService as unknown as OutboxService,
    );
  });

  it('does nothing for an order that no longer exists', async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await service.provisionForOrder('missing');
    expect(prisma.tx.fulfillmentOrder.create).not.toHaveBeenCalled();
  });

  it('skips an item with no reservation instead of failing the whole group', async () => {
    prisma.order.findUnique.mockResolvedValue(
      orderWithGroup([
        { id: 'oi-1', quantity: 2, reservationId: null, offer: { variantId: 'v1' } },
      ]),
    );

    await service.provisionForOrder('order-1');

    expect(prisma.tx.fulfillmentOrder.create).not.toHaveBeenCalled();
  });

  it('resolves the warehouse from the committed reservation and creates a fulfillment order with PICK and PACK work items', async () => {
    prisma.order.findUnique.mockResolvedValue(
      orderWithGroup([
        {
          id: 'oi-1',
          quantity: 3,
          reservationId: 'res-1',
          offer: { variantId: 'v1' },
        },
      ]),
    );
    prisma.reservation.findUnique.mockResolvedValue({
      id: 'res-1',
      inventoryRecordId: 'rec-1',
    });
    prisma.inventoryRecord.findUnique.mockResolvedValue({
      id: 'rec-1',
      warehouseId: 'wh-1',
    });
    prisma.tx.fulfillmentOrder.create.mockResolvedValue({ id: 'fo-1' });

    await service.provisionForOrder('order-1');

    expect(prisma.tx.fulfillmentOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          sellerOrderId: SELLER_ORDER_ID,
          shippingGroupId: SHIPPING_GROUP_ID,
          warehouseId: 'wh-1',
          lines: {
            create: [
              expect.objectContaining({
                orderItemId: 'oi-1',
                variantId: 'v1',
                reservationId: 'res-1',
                inventoryRecordId: 'rec-1',
                allocatedQuantity: 3,
              }),
            ],
          },
          workItems: { create: [{ type: 'PICK' }, { type: 'PACK' }] },
        }) as object,
      }),
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'fulfillment.order.created' }),
      prisma.tx,
    );
    expect(outboxService.record).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'fulfillment.provisioned' }),
      prisma.tx,
    );
  });

  it('groups items across two warehouses into two fulfillment orders', async () => {
    prisma.order.findUnique.mockResolvedValue(
      orderWithGroup([
        { id: 'oi-1', quantity: 1, reservationId: 'res-1', offer: { variantId: 'v1' } },
        { id: 'oi-2', quantity: 1, reservationId: 'res-2', offer: { variantId: 'v2' } },
      ]),
    );
    prisma.reservation.findUnique.mockImplementation(({ where: { id } }: { where: { id: string } }) =>
      Promise.resolve({ id, inventoryRecordId: id === 'res-1' ? 'rec-1' : 'rec-2' }),
    );
    prisma.inventoryRecord.findUnique.mockImplementation(({ where: { id } }: { where: { id: string } }) =>
      Promise.resolve({ id, warehouseId: id === 'rec-1' ? 'wh-1' : 'wh-2' }),
    );
    prisma.tx.fulfillmentOrder.create.mockResolvedValue({ id: 'fo-x' });

    await service.provisionForOrder('order-1');

    expect(prisma.tx.fulfillmentOrder.create).toHaveBeenCalledTimes(2);
    const warehouseIds = prisma.tx.fulfillmentOrder.create.mock.calls.map(
      (call: [{ data: { warehouseId: string } }]) => call[0].data.warehouseId,
    );
    expect(warehouseIds.sort()).toEqual(['wh-1', 'wh-2']);
  });

  it('treats a duplicate (shippingGroupId, warehouseId) as a successful replay, not an error', async () => {
    prisma.order.findUnique.mockResolvedValue(
      orderWithGroup([
        { id: 'oi-1', quantity: 1, reservationId: 'res-1', offer: { variantId: 'v1' } },
      ]),
    );
    prisma.reservation.findUnique.mockResolvedValue({ id: 'res-1', inventoryRecordId: 'rec-1' });
    prisma.inventoryRecord.findUnique.mockResolvedValue({ id: 'rec-1', warehouseId: 'wh-1' });
    prisma.tx.fulfillmentOrder.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.provisionForOrder('order-1')).resolves.toBeUndefined();
  });
});
