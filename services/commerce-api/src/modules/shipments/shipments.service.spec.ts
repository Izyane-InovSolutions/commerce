import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, ShipmentStatus, TrackingEventSource } from '@prisma/client';

import { NumberingService } from '../../common/numbering/numbering.service';
import { PrismaService } from '../../database/prisma.service';
import { OutboxService } from '../../infrastructure/jobs/outbox.service';
import { AuditService } from '../audit/audit.service';
import { FulfillmentsService } from '../fulfillment/fulfillments.service';
import { CarrierProviderRegistry } from './carrier-provider.registry';
import { ShipmentsService } from './shipments.service';

function buildTx(): {
  shipment: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  order: { findUniqueOrThrow: jest.Mock };
  shippingGroup: { findUniqueOrThrow: jest.Mock };
  trackingEvent: { findFirst: jest.Mock; create: jest.Mock };
  carrierWebhookDelivery: { create: jest.Mock; update: jest.Mock };
  $queryRaw: jest.Mock;
} {
  return {
    shipment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    order: { findUniqueOrThrow: jest.fn() },
    shippingGroup: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        providerCode: 'ZONE',
        carrierCode: 'MANUAL',
        methodCode: 'DOMESTIC_STANDARD_V1',
      }),
    },
    trackingEvent: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    carrierWebhookDelivery: { create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

function buildPrisma(): {
  order: { findUnique: jest.Mock };
  shipment: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  carrierWebhookDelivery: { create: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
  tx: ReturnType<typeof buildTx>;
} {
  const tx = buildTx();
  return {
    order: { findUnique: jest.fn() },
    shipment: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    carrierWebhookDelivery: { create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(
      (arg: ((client: typeof tx) => unknown) | Promise<unknown>[]) =>
        Array.isArray(arg) ? Promise.all(arg) : arg(tx),
    ),
    tx,
  };
}

const FO = {
  id: 'fo-1',
  orderId: 'order-1',
  sellerOrderId: 'so-1',
  shippingGroupId: 'sg-1',
  warehouseId: 'wh-1',
  lines: [{ id: 'fl-1', orderItemId: 'oi-1' }],
};

describe('ShipmentsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let fulfillmentsService: {
    assignShipmentQuantity: jest.Mock;
    releaseShipmentQuantity: jest.Mock;
  };
  let numberingService: { nextShipmentNumber: jest.Mock };
  let carrierProviderRegistry: { get: jest.Mock };
  let auditService: { record: jest.Mock };
  let outboxService: { record: jest.Mock };
  let manualProvider: {
    providerCode: string;
    book: jest.Mock;
    cancel: jest.Mock;
    poll: jest.Mock;
    parseWebhook?: jest.Mock;
  };
  let service: ShipmentsService;

  beforeEach(() => {
    prisma = buildPrisma();
    fulfillmentsService = {
      assignShipmentQuantity: jest.fn().mockResolvedValue(FO),
      releaseShipmentQuantity: jest.fn().mockResolvedValue(undefined),
    };
    numberingService = { nextShipmentNumber: jest.fn().mockResolvedValue('SH-2026-000001') };
    manualProvider = {
      providerCode: 'ZONE',
      book: jest.fn().mockResolvedValue({ trackingReference: 'MANUAL-1' }),
      cancel: jest.fn().mockResolvedValue(undefined),
      poll: jest.fn().mockResolvedValue([]),
    };
    carrierProviderRegistry = { get: jest.fn().mockReturnValue(manualProvider) };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    outboxService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ShipmentsService(
      prisma as unknown as PrismaService,
      fulfillmentsService as unknown as FulfillmentsService,
      numberingService as unknown as NumberingService,
      carrierProviderRegistry as unknown as CarrierProviderRegistry,
      auditService as unknown as AuditService,
      outboxService as unknown as OutboxService,
    );
  });

  describe('getCustomerShipments', () => {
    it('returns not found instead of leaking another customer order', async () => {
      prisma.order.findUnique.mockResolvedValue({ userId: 'other-user' });

      await expect(service.getCustomerShipments('user-1', 'order-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.shipment.findMany).not.toHaveBeenCalled();
    });

    it('returns normalized tracking only for the owning customer', async () => {
      const occurredAt = new Date();
      prisma.order.findUnique.mockResolvedValue({ userId: 'user-1' });
      prisma.shipment.findMany.mockResolvedValue([
        {
          id: 'ship-1',
          shipmentNumber: 'SH-1',
          status: ShipmentStatus.IN_TRANSIT,
          trackingReference: 'TRACK-1',
          estimatedDeliveryAt: null,
          createdAt: occurredAt,
          shippingGroup: { methodName: 'Standard' },
          trackingEvents: [
            {
              normalizedStatus: ShipmentStatus.IN_TRANSIT,
              description: 'In transit',
              location: 'Lusaka',
              occurredAt,
            },
          ],
        },
      ]);

      await expect(service.getCustomerShipments('user-1', 'order-1')).resolves.toEqual([
        expect.objectContaining({
          id: 'ship-1',
          methodName: 'Standard',
          events: [
            {
              normalizedStatus: ShipmentStatus.IN_TRANSIT,
              description: 'In transit',
              location: 'Lusaka',
              occurredAt,
            },
          ],
        }),
      ]);
    });
  });

  describe('create', () => {
    it('replays an existing shipment for a reused idempotency key without reallocating', async () => {
      prisma.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        fulfillmentOrderId: 'fo-1',
        lines: [],
      });

      const result = await service.create(
        { fulfillmentOrderId: 'fo-1', lines: [] },
        'user-1',
        'idem-1',
      );

      expect(result).toEqual({ id: 'ship-1', fulfillmentOrderId: 'fo-1', lines: [] });
      expect(fulfillmentsService.assignShipmentQuantity).not.toHaveBeenCalled();
    });

    it('rejects reuse of an idempotency key for a different request', async () => {
      prisma.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        fulfillmentOrderId: 'fo-1',
        lines: [{ fulfillmentLineId: 'fl-1', quantity: 1 }],
      });

      await expect(
        service.create(
          {
            fulfillmentOrderId: 'fo-1',
            lines: [{ fulfillmentLineId: 'fl-1', quantity: 2 }],
          },
          'user-1',
          'idem-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allocates packed quantity and creates the shipment', async () => {
      prisma.shipment.findUnique.mockResolvedValue(null);
      prisma.tx.shipment.create.mockResolvedValue({ id: 'ship-1', lines: [] });

      await service.create(
        {
          fulfillmentOrderId: 'fo-1',
          lines: [{ fulfillmentLineId: 'fl-1', quantity: 3 }],
        },
        'user-1',
        'idem-2',
      );

      expect(fulfillmentsService.assignShipmentQuantity).toHaveBeenCalledWith(
        prisma.tx,
        'fo-1',
        [{ fulfillmentLineId: 'fl-1', quantity: 3 }],
      );
      expect(prisma.tx.shipment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            shippingGroupId: 'sg-1',
            warehouseId: 'wh-1',
            providerCode: 'ZONE',
            carrierCode: 'MANUAL',
            methodCode: 'DOMESTIC_STANDARD_V1',
            bookingIdempotencyKey: 'idem-2',
          }) as object,
        }),
      );
    });

    it('propagates an over-allocation error from FulfillmentsService', async () => {
      prisma.shipment.findUnique.mockResolvedValue(null);
      fulfillmentsService.assignShipmentQuantity.mockRejectedValue(new ConflictException('nope'));

      await expect(
        service.create(
          {
            fulfillmentOrderId: 'fo-1',
            lines: [{ fulfillmentLineId: 'fl-1', quantity: 999 }],
          },
          'user-1',
          'idem-3',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('book', () => {
    it('is idempotent when already booked', async () => {
      prisma.tx.shipment.findUnique.mockResolvedValue({ id: 'ship-1', status: ShipmentStatus.BOOKED });
      prisma.tx.shipment.findUniqueOrThrow.mockResolvedValue({ id: 'ship-1', status: ShipmentStatus.BOOKED, lines: [] });

      const result = await service.book('ship-1', 'user-1');

      expect(result).toEqual({ id: 'ship-1', status: ShipmentStatus.BOOKED, lines: [] });
      expect(manualProvider.book).not.toHaveBeenCalled();
    });

    it('rejects booking a shipment that is not PENDING_BOOKING', async () => {
      prisma.tx.shipment.findUnique.mockResolvedValue({ id: 'ship-1', status: ShipmentStatus.CANCELLED });

      await expect(service.book('ship-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('books via the carrier provider and records tracking reference', async () => {
      prisma.tx.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        status: ShipmentStatus.PENDING_BOOKING,
        providerCode: 'ZONE',
        carrierCode: 'MANUAL',
        methodCode: 'DOMESTIC_STANDARD_V1',
        shipmentNumber: 'SH-2026-000001',
        orderId: 'order-1',
      });
      prisma.tx.order.findUniqueOrThrow.mockResolvedValue({
        shippingAddress: { country: 'ZM' },
      });
      prisma.tx.shipment.update.mockResolvedValue({ id: 'ship-1', status: ShipmentStatus.BOOKED, lines: [] });

      await service.book('ship-1', 'user-1');

      expect(manualProvider.book).toHaveBeenCalledWith(
        expect.objectContaining({ destinationCountry: 'ZM' }),
      );
      expect(prisma.tx.shipment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ShipmentStatus.BOOKED, trackingReference: 'MANUAL-1' }) as object,
        }),
      );
    });
  });

  describe('cancel', () => {
    it('releases the shipment-assignment claim and cancels via the carrier', async () => {
      prisma.tx.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        status: ShipmentStatus.BOOKED,
        providerCode: 'ZONE',
        trackingReference: 'MANUAL-1',
        fulfillmentOrderId: 'fo-1',
        lines: [{ fulfillmentLineId: 'fl-1', quantity: 3 }],
      });
      prisma.tx.shipment.update.mockResolvedValue({ id: 'ship-1', status: ShipmentStatus.CANCELLED, lines: [] });

      await service.cancel('ship-1', 'customer changed mind', 'user-1');

      expect(manualProvider.cancel).toHaveBeenCalledWith('MANUAL-1');
      expect(fulfillmentsService.releaseShipmentQuantity).toHaveBeenCalledWith(prisma.tx, 'fo-1', [
        { fulfillmentLineId: 'fl-1', quantity: 3 },
      ]);
    });

    it('rejects cancelling a dispatched shipment', async () => {
      prisma.tx.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        status: ShipmentStatus.DISPATCHED,
        lines: [],
      });

      await expect(service.cancel('ship-1', 'too late', 'user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('addManualTrackingEvent / status projection', () => {
    it('advances the shipment status for a normal admin event', async () => {
      prisma.tx.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        status: ShipmentStatus.BOOKED,
      });
      prisma.tx.trackingEvent.create.mockResolvedValue({ id: 'te-1' });

      await service.addManualTrackingEvent(
        'ship-1',
        { normalizedStatus: ShipmentStatus.IN_TRANSIT, occurredAt: new Date().toISOString() },
        'admin-1',
        Role.ADMIN,
      );

      expect(prisma.tx.shipment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ShipmentStatus.IN_TRANSIT }) as object,
        }),
      );
    });

    it('does not regress a terminal status from a normal event', async () => {
      prisma.tx.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        status: ShipmentStatus.DELIVERED,
      });
      prisma.tx.trackingEvent.create.mockResolvedValue({ id: 'te-1' });

      await service.addManualTrackingEvent(
        'ship-1',
        { normalizedStatus: ShipmentStatus.IN_TRANSIT, occurredAt: new Date().toISOString() },
        'admin-1',
        Role.ADMIN,
      );

      expect(prisma.tx.shipment.update).not.toHaveBeenCalled();
    });

    it('lets a correction override a terminal status', async () => {
      prisma.tx.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        status: ShipmentStatus.DELIVERED,
      });
      prisma.tx.trackingEvent.create.mockResolvedValue({ id: 'te-1' });

      await service.addManualTrackingEvent(
        'ship-1',
        {
          normalizedStatus: ShipmentStatus.RETURN_TO_SENDER,
          occurredAt: new Date().toISOString(),
          isCorrection: true,
          correctionReason: 'delivered to wrong address',
        },
        'admin-1',
        Role.ADMIN,
      );

      expect(prisma.tx.shipment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ShipmentStatus.RETURN_TO_SENDER }) as object,
        }),
      );
      expect(prisma.tx.trackingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source: TrackingEventSource.ADMIN_CORRECTION }) as object,
        }),
      );
    });

    it('rejects a correction from staff', async () => {
      await expect(
        service.addManualTrackingEvent(
          'ship-1',
          {
            normalizedStatus: ShipmentStatus.IN_TRANSIT,
            isCorrection: true,
            correctionReason: 'incorrect scan',
          },
          'staff-1',
          Role.STAFF,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('ingestWebhook', () => {
    it('treats a duplicate delivery as a no-op', async () => {
      manualProvider.parseWebhook = jest.fn().mockReturnValue({ events: [] });
      carrierProviderRegistry.get.mockReturnValue(manualProvider as never);
      prisma.carrierWebhookDelivery.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.ingestWebhook('ZONE', { foo: 'bar' }, {}),
      ).resolves.toBeUndefined();
      expect(prisma.tx.shipment.findFirst).not.toHaveBeenCalled();
    });

    it('persists a failed delivery after event processing rolls back', async () => {
      manualProvider.parseWebhook = jest.fn().mockReturnValue({
        events: [
          {
            trackingReference: 'TRACK-1',
            normalizedStatus: ShipmentStatus.IN_TRANSIT,
            occurredAt: new Date(),
          },
        ],
      });
      carrierProviderRegistry.get.mockReturnValue(manualProvider as never);
      prisma.carrierWebhookDelivery.create.mockResolvedValue({ id: 'delivery-1' });
      prisma.tx.shipment.findFirst.mockRejectedValue(new Error('database failed'));

      await expect(service.ingestWebhook('ZONE', { foo: 'bar' }, {})).rejects.toThrow(
        'database failed',
      );
      expect(prisma.carrierWebhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: { status: 'FAILED', failureReason: 'database failed' },
      });
    });

    it('rejects a provider with no webhook support', async () => {
      await expect(service.ingestWebhook('ZONE', {}, {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
