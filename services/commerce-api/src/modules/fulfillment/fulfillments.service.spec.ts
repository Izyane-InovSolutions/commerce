import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  FulfillmentExceptionStatus,
  FulfillmentWorkItemStatus,
  FulfillmentWorkItemType,
  Role,
  ShipmentStatus,
} from '@prisma/client';

import { NumberingService } from '../../common/numbering/numbering.service';
import { PrismaService } from '../../database/prisma.service';
import { BackgroundJobsService } from '../../infrastructure/jobs/background-jobs.service';
import { OutboxService } from '../../infrastructure/jobs/outbox.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { FulfillmentsService } from './fulfillments.service';

const PICK_ITEM = {
  id: 'wi-pick',
  type: FulfillmentWorkItemType.PICK,
  status: FulfillmentWorkItemStatus.PENDING,
  assignedUserId: 'staff-1',
  version: 0,
};
const PACK_ITEM = {
  id: 'wi-pack',
  type: FulfillmentWorkItemType.PACK,
  status: FulfillmentWorkItemStatus.PENDING,
  assignedUserId: 'staff-1',
  version: 0,
};

function fulfillmentLine(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'fl-1',
    orderItemId: 'oi-1',
    variantId: 'v1',
    allocatedQuantity: 10,
    pickedQuantity: 0,
    packedQuantity: 0,
    dispatchedQuantity: 0,
    cancelledQuantity: 0,
    ...overrides,
  };
}

function foRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'fo-1',
    orderId: 'order-1',
    sellerOrderId: 'so-1',
    warehouseId: 'wh-1',
    lines: [fulfillmentLine()],
    workItems: [PICK_ITEM, PACK_ITEM],
    ...overrides,
  };
}

function buildTx(): {
  fulfillmentOrder: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
  };
  fulfillmentWorkItem: { updateMany: jest.Mock; findMany: jest.Mock };
  fulfillmentLine: { update: jest.Mock; findMany: jest.Mock };
  fulfillmentException: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  fulfillmentEvent: { create: jest.Mock; findUnique: jest.Mock };
  fulfillmentDispatch: { findUnique: jest.Mock; create: jest.Mock };
  shipment: { findUnique: jest.Mock; update: jest.Mock };
  user: { findUnique: jest.Mock };
  $queryRaw: jest.Mock;
} {
  return {
    fulfillmentOrder: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    fulfillmentWorkItem: {
      updateMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([PICK_ITEM, PACK_ITEM]),
    },
    fulfillmentLine: {
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([fulfillmentLine()]),
    },
    fulfillmentException: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    fulfillmentEvent: {
      create: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    fulfillmentDispatch: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    shipment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ isActive: true, role: Role.STAFF }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

function buildPrisma(): {
  $transaction: jest.Mock;
  tx: ReturnType<typeof buildTx>;
} {
  const tx = buildTx();
  return {
    $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
    tx,
  };
}

describe('FulfillmentsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let inventoryService: { returnCancelledStock: jest.Mock };
  let numberingService: { nextFulfillmentDispatchNumber: jest.Mock };
  let auditService: { record: jest.Mock };
  let outboxService: { record: jest.Mock };
  let backgroundJobsService: { enqueue: jest.Mock };
  let service: FulfillmentsService;

  beforeEach(() => {
    prisma = buildPrisma();
    prisma.tx.fulfillmentOrder.findUnique.mockResolvedValue(foRow());
    prisma.tx.fulfillmentOrder.findUniqueOrThrow.mockResolvedValue(foRow());
    inventoryService = {
      returnCancelledStock: jest
        .fn()
        .mockResolvedValue({ record: {}, movement: { id: 'mv-1' } }),
    };
    numberingService = {
      nextFulfillmentDispatchNumber: jest.fn().mockResolvedValue('FD-2026-000001'),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    outboxService = { record: jest.fn().mockResolvedValue(undefined) };
    backgroundJobsService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new FulfillmentsService(
      prisma as unknown as PrismaService,
      inventoryService as unknown as InventoryService,
      numberingService as unknown as NumberingService,
      auditService as unknown as AuditService,
      outboxService as unknown as OutboxService,
      backgroundJobsService as unknown as BackgroundJobsService,
    );
  });

  describe('startWork', () => {
    it('refuses a staff member who is not assigned to the work item', async () => {
      await expect(
        service.startWork('fo-1', FulfillmentWorkItemType.PICK, 0, 'someone-else', Role.STAFF),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.tx.fulfillmentWorkItem.updateMany).not.toHaveBeenCalled();
    });

    it('allows an admin to start unassigned work', async () => {
      prisma.tx.fulfillmentWorkItem.updateMany.mockResolvedValue({ count: 1 });

      await service.startWork('fo-1', FulfillmentWorkItemType.PICK, 0, 'admin-1', Role.ADMIN);

      expect(prisma.tx.fulfillmentWorkItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wi-pick', version: 0 },
          data: expect.objectContaining({ status: FulfillmentWorkItemStatus.IN_PROGRESS }) as object,
        }),
      );
    });

    it('rejects starting a work item that is not PENDING', async () => {
      prisma.tx.fulfillmentOrder.findUnique.mockResolvedValue(
        foRow({ workItems: [{ ...PICK_ITEM, status: FulfillmentWorkItemStatus.IN_PROGRESS }, PACK_ITEM] }),
      );

      await expect(
        service.startWork('fo-1', FulfillmentWorkItemType.PICK, 0, 'staff-1', Role.STAFF),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a stale version', async () => {
      prisma.tx.fulfillmentWorkItem.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.startWork('fo-1', FulfillmentWorkItemType.PICK, 0, 'staff-1', Role.STAFF),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('recordQuantities', () => {
    beforeEach(() => {
      prisma.tx.fulfillmentOrder.findUnique.mockResolvedValue(
        foRow({ workItems: [{ ...PICK_ITEM, status: FulfillmentWorkItemStatus.IN_PROGRESS }, PACK_ITEM] }),
      );
    });

    it('replays an already-applied idempotency key without reapplying', async () => {
      const lines = [{ fulfillmentLineId: 'fl-1', quantity: 5 }];
      prisma.tx.fulfillmentEvent.findUnique.mockResolvedValue({
        fulfillmentOrderId: 'fo-1',
        type: 'picks.recorded',
        metadata: { lines },
      });

      await service.recordQuantities(
        'fo-1',
        FulfillmentWorkItemType.PICK,
        lines,
        'staff-1',
        Role.STAFF,
        'idem-1',
      );

      expect(prisma.tx.fulfillmentLine.update).not.toHaveBeenCalled();
    });

    it('rejects a reused idempotency key applied to a different request', async () => {
      prisma.tx.fulfillmentEvent.findUnique.mockResolvedValue({
        fulfillmentOrderId: 'fo-1',
        type: 'picks.recorded',
        metadata: { lines: [{ fulfillmentLineId: 'fl-1', quantity: 1 }] },
      });

      await expect(
        service.recordQuantities(
          'fo-1',
          FulfillmentWorkItemType.PICK,
          [{ fulfillmentLineId: 'fl-1', quantity: 5 }],
          'staff-1',
          Role.STAFF,
          'idem-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects picking more than allocated minus cancelled', async () => {
      await expect(
        service.recordQuantities(
          'fo-1',
          FulfillmentWorkItemType.PICK,
          [{ fulfillmentLineId: 'fl-1', quantity: 11 }],
          'staff-1',
          Role.STAFF,
          'idem-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('requires the pick work item to be in progress', async () => {
      prisma.tx.fulfillmentOrder.findUnique.mockResolvedValue(foRow());

      await expect(
        service.recordQuantities(
          'fo-1',
          FulfillmentWorkItemType.PICK,
          [{ fulfillmentLineId: 'fl-1', quantity: 1 }],
          'staff-1',
          Role.STAFF,
          'idem-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('records a pick within the allocated ceiling', async () => {
      await service.recordQuantities(
        'fo-1',
        FulfillmentWorkItemType.PICK,
        [{ fulfillmentLineId: 'fl-1', quantity: 4 }],
        'staff-1',
        Role.STAFF,
        'idem-1',
      );

      expect(prisma.tx.fulfillmentLine.update).toHaveBeenCalledWith({
        where: { id: 'fl-1' },
        data: { pickedQuantity: { increment: 4 } },
      });
      expect(prisma.tx.fulfillmentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ idempotencyKey: 'idem-1', type: 'picks.recorded' }) as object,
        }),
      );
    });

    it('rejects packing more than picked', async () => {
      prisma.tx.fulfillmentOrder.findUnique.mockResolvedValue(
        foRow({
          lines: [fulfillmentLine({ pickedQuantity: 5, packedQuantity: 0 })],
          workItems: [PICK_ITEM, { ...PACK_ITEM, status: FulfillmentWorkItemStatus.IN_PROGRESS }],
        }),
      );

      await expect(
        service.recordQuantities(
          'fo-1',
          FulfillmentWorkItemType.PACK,
          [{ fulfillmentLineId: 'fl-1', quantity: 6 }],
          'staff-1',
          Role.STAFF,
          'idem-2',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('completeWork', () => {
    it('refuses to complete while an exception is open', async () => {
      prisma.tx.fulfillmentOrder.findUnique.mockResolvedValue(
        foRow({ workItems: [{ ...PICK_ITEM, status: FulfillmentWorkItemStatus.IN_PROGRESS }, PACK_ITEM] }),
      );
      prisma.tx.fulfillmentException.count.mockResolvedValue(1);

      await expect(
        service.completeWork('fo-1', FulfillmentWorkItemType.PICK, 0, 'staff-1', Role.STAFF),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to complete until every active unit is picked', async () => {
      prisma.tx.fulfillmentOrder.findUnique.mockResolvedValue(
        foRow({
          lines: [fulfillmentLine({ pickedQuantity: 6 })],
          workItems: [{ ...PICK_ITEM, status: FulfillmentWorkItemStatus.IN_PROGRESS }, PACK_ITEM],
        }),
      );

      await expect(
        service.completeWork('fo-1', FulfillmentWorkItemType.PICK, 0, 'staff-1', Role.STAFF),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('completes once every active unit is picked and no exception is open', async () => {
      prisma.tx.fulfillmentOrder.findUnique.mockResolvedValue(
        foRow({
          lines: [fulfillmentLine({ pickedQuantity: 10 })],
          workItems: [{ ...PICK_ITEM, status: FulfillmentWorkItemStatus.IN_PROGRESS }, PACK_ITEM],
        }),
      );
      prisma.tx.fulfillmentWorkItem.updateMany.mockResolvedValue({ count: 1 });

      await service.completeWork('fo-1', FulfillmentWorkItemType.PICK, 0, 'staff-1', Role.STAFF);

      expect(prisma.tx.fulfillmentWorkItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: FulfillmentWorkItemStatus.COMPLETED }) as object,
        }),
      );
    });

    it('an already-cancelled quantity does not count against completion', async () => {
      prisma.tx.fulfillmentOrder.findUnique.mockResolvedValue(
        foRow({
          lines: [fulfillmentLine({ allocatedQuantity: 10, cancelledQuantity: 4, pickedQuantity: 6 })],
          workItems: [{ ...PICK_ITEM, status: FulfillmentWorkItemStatus.IN_PROGRESS }, PACK_ITEM],
        }),
      );
      prisma.tx.fulfillmentWorkItem.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.completeWork('fo-1', FulfillmentWorkItemType.PICK, 0, 'staff-1', Role.STAFF),
      ).resolves.toBeDefined();
    });
  });

  describe('createException / resolveException', () => {
    it('rejects a line that does not belong to the fulfillment order', async () => {
      await expect(
        service.createException(
          'fo-1',
          { fulfillmentLineId: 'not-a-line', type: 'SHORT_PICK', quantity: 1, reason: 'short' } as never,
          'staff-1',
        ),
      ).rejects.toBeInstanceOf(Error);
    });

    it('creates an exception against a known line', async () => {
      prisma.tx.fulfillmentException.create.mockResolvedValue({ id: 'exc-1' });

      await service.createException(
        'fo-1',
        { fulfillmentLineId: 'fl-1', type: 'SHORT_PICK', quantity: 2, reason: 'short pick' } as never,
        'staff-1',
      );

      expect(prisma.tx.fulfillmentException.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fulfillmentLineId: 'fl-1', quantity: 2 }) as object,
        }),
      );
    });

    it('resolveException with cancel_quantity returns inventory and emits refund_required', async () => {
      prisma.tx.fulfillmentException.findUnique.mockResolvedValue({
        id: 'exc-1',
        fulfillmentOrderId: 'fo-1',
        fulfillmentLineId: 'fl-1',
        quantity: 3,
        status: FulfillmentExceptionStatus.OPEN,
      });

      await service.resolveException(
        'fo-1',
        'exc-1',
        { action: 'cancel_quantity', resolution: 'could not locate stock' },
        'admin-1',
      );

      expect(inventoryService.returnCancelledStock).toHaveBeenCalledWith(
        prisma.tx,
        'wh-1',
        'v1',
        3,
        expect.objectContaining({ referenceType: 'fulfillment_cancellation_line' }),
        'could not locate stock',
      );
      expect(outboxService.record).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'fulfillment.refund_required' }),
        prisma.tx,
      );
    });

    it('resolveException is idempotent for an already-resolved exception', async () => {
      prisma.tx.fulfillmentException.findUnique.mockResolvedValue({
        id: 'exc-1',
        fulfillmentOrderId: 'fo-1',
        status: FulfillmentExceptionStatus.RESOLVED,
      });

      await service.resolveException(
        'fo-1',
        'exc-1',
        { action: 'resume', resolution: 'already handled' },
        'admin-1',
      );

      expect(prisma.tx.fulfillmentException.update).not.toHaveBeenCalled();
    });
  });

  describe('dispatch', () => {
    it('rejects a shipment that is not BOOKED', async () => {
      prisma.tx.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        fulfillmentOrderId: 'fo-1',
        status: ShipmentStatus.PENDING_BOOKING,
        lines: [],
      });

      await expect(
        service.dispatch('fo-1', 'ship-1', 'staff-1', 'idem-3'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a shipment belonging to a different fulfillment order', async () => {
      prisma.tx.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        fulfillmentOrderId: 'fo-other',
        status: ShipmentStatus.BOOKED,
        lines: [],
      });

      await expect(service.dispatch('fo-1', 'ship-1', 'staff-1', 'idem-3')).rejects.toThrow();
    });

    it('dispatches a booked shipment and increments dispatchedQuantity', async () => {
      prisma.tx.fulfillmentOrder.findUnique.mockResolvedValue(
        foRow({ lines: [fulfillmentLine({ shipmentAssignedQuantity: 5, packedQuantity: 5 })] }),
      );
      prisma.tx.shipment.findUnique.mockResolvedValue({
        id: 'ship-1',
        fulfillmentOrderId: 'fo-1',
        status: ShipmentStatus.BOOKED,
        lines: [{ fulfillmentLineId: 'fl-1', quantity: 5 }],
      });
      prisma.tx.fulfillmentDispatch.create.mockResolvedValue({ id: 'disp-1', lines: [] });

      await service.dispatch('fo-1', 'ship-1', 'staff-1', 'idem-3');

      expect(prisma.tx.fulfillmentLine.update).toHaveBeenCalledWith({
        where: { id: 'fl-1' },
        data: { dispatchedQuantity: { increment: 5 } },
      });
      expect(prisma.tx.shipment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ship-1' },
          data: expect.objectContaining({ status: ShipmentStatus.DISPATCHED }) as object,
        }),
      );
    });
  });

  describe('cancel', () => {
    it('rejects cancelling more than the undispatched active quantity', async () => {
      prisma.tx.fulfillmentOrder.findUnique.mockResolvedValue(
        foRow({ lines: [fulfillmentLine({ allocatedQuantity: 10, dispatchedQuantity: 8 })] }),
      );

      await expect(
        service.cancel(
          'fo-1',
          { lines: [{ fulfillmentLineId: 'fl-1', quantity: 5 }], reason: 'customer cancelled' },
          'admin-1',
          'idem-4',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('cancels an eligible quantity and returns inventory', async () => {
      await service.cancel(
        'fo-1',
        { lines: [{ fulfillmentLineId: 'fl-1', quantity: 3 }], reason: 'customer cancelled' },
        'admin-1',
        'idem-4',
      );

      expect(prisma.tx.fulfillmentLine.update).toHaveBeenCalledWith({
        where: { id: 'fl-1' },
        data: { cancelledQuantity: { increment: 3 } },
      });
      expect(inventoryService.returnCancelledStock).toHaveBeenCalledWith(
        prisma.tx,
        'wh-1',
        'v1',
        3,
        expect.objectContaining({ referenceType: 'fulfillment_cancellation_line' }),
        'customer cancelled',
      );
    });
  });

  describe('assignWorkItem', () => {
    it('rejects an unknown work item type', async () => {
      await expect(
        service.assignWorkItem(
          'fo-1',
          'BOGUS' as FulfillmentWorkItemType,
          'staff-2',
          0,
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reassigns the work item', async () => {
      prisma.tx.fulfillmentWorkItem.updateMany.mockResolvedValue({ count: 1 });

      await service.assignWorkItem('fo-1', FulfillmentWorkItemType.PICK, 'staff-2', 0, 'admin-1');

      expect(prisma.tx.fulfillmentWorkItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'wi-pick', version: 0 },
        data: { assignedUserId: 'staff-2', version: { increment: 1 } },
      });
    });

    it('rejects an assignee who is not an active STAFF user', async () => {
      prisma.tx.user.findUnique.mockResolvedValue({ isActive: true, role: Role.ADMIN });

      await expect(
        service.assignWorkItem('fo-1', FulfillmentWorkItemType.PICK, 'admin-2', 0, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.tx.fulfillmentWorkItem.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an assignee that does not exist', async () => {
      prisma.tx.user.findUnique.mockResolvedValue(null);

      await expect(
        service.assignWorkItem('fo-1', FulfillmentWorkItemType.PICK, 'unknown', 0, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
