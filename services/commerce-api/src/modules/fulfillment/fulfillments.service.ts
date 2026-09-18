import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FulfillmentExceptionStatus,
  FulfillmentLine,
  FulfillmentWorkItem,
  FulfillmentWorkItemStatus,
  FulfillmentWorkItemType,
  Prisma,
  Role,
  ShipmentStatus,
} from '@prisma/client';

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from '../../common/pagination/pagination-query.dto';
import { NumberingService } from '../../common/numbering/numbering.service';
import { PrismaService } from '../../database/prisma.service';
import { OutboxService } from '../../infrastructure/jobs/outbox.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { CancelLinesDto } from './dto/cancel-lines.dto';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { ListFulfillmentsDto } from './dto/list-fulfillments.dto';
import { QuantityLineDto } from './dto/quantity-line.dto';
import { ResolveExceptionDto } from './dto/resolve-exception.dto';
import { deriveFulfillmentStatus } from './fulfillment-status';
import {
  FulfillmentDispatchWithLines,
  FulfillmentOrderPage,
  FulfillmentOrderWithDetail,
} from './fulfillment.types';

export type LockedFulfillmentOrder = {
  id: string;
  orderId: string;
  sellerOrderId: string;
  shippingGroupId: string;
  warehouseId: string;
  lines: FulfillmentLine[];
  workItems: FulfillmentWorkItem[];
};

/**
 * JSON.stringify with object keys sorted recursively. Postgres jsonb does not
 * preserve insertion order, so comparing a value freshly built in application
 * code against the same value round-tripped through a jsonb column requires a
 * key-order-independent comparison, not a plain JSON.stringify equality check.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

@Injectable()
export class FulfillmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly numberingService: NumberingService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  async findAll(query: ListFulfillmentsDto): Promise<FulfillmentOrderPage> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.FulfillmentOrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.assignedUserId
        ? { workItems: { some: { assignedUserId: query.assignedUserId } } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.fulfillmentOrder.findMany({
        where,
        include: { lines: true, workItems: true, exceptions: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.fulfillmentOrder.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: string): Promise<FulfillmentOrderWithDetail> {
    const fo = await this.prisma.fulfillmentOrder.findUnique({
      where: { id },
      include: { lines: true, workItems: true, exceptions: true },
    });
    if (!fo) throw new NotFoundException('Fulfillment order not found');
    return fo;
  }

  listEvents(id: string): Promise<Prisma.FulfillmentEventGetPayload<object>[]> {
    return this.prisma.fulfillmentEvent.findMany({
      where: { fulfillmentOrderId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin-only, enforced at the controller: "Admins assign PICK and PACK work." */
  async assignWorkItem(
    fulfillmentOrderId: string,
    type: FulfillmentWorkItemType,
    assigneeUserId: string,
    version: number,
    actorUserId: string,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.prisma.$transaction(async (tx) => {
      const fo = await this.lockFulfillmentOrder(tx, fulfillmentOrderId);
      const workItem = this.requireWorkItem(fo, type);

      const assignee = await tx.user.findUnique({
        where: { id: assigneeUserId },
        select: { isActive: true, role: true },
      });
      if (!assignee || !assignee.isActive || assignee.role !== Role.STAFF) {
        throw new BadRequestException(
          'assigneeUserId must belong to an active STAFF user',
        );
      }

      const result = await tx.fulfillmentWorkItem.updateMany({
        where: { id: workItem.id, version },
        data: { assignedUserId: assigneeUserId, version: { increment: 1 } },
      });
      if (result.count !== 1) {
        throw new ConflictException('Work item changed; reload and try again');
      }

      await this.recordEvent(tx, fulfillmentOrderId, 'work_item.assigned', actorUserId, {
        type,
        assigneeUserId,
      });

      return this.reload(tx, fulfillmentOrderId);
    });
  }

  async startWork(
    fulfillmentOrderId: string,
    type: FulfillmentWorkItemType,
    version: number,
    actorUserId: string,
    actorRole: Role,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.prisma.$transaction(async (tx) => {
      const fo = await this.lockFulfillmentOrder(tx, fulfillmentOrderId);
      const workItem = this.requireWorkItem(fo, type);
      this.assertCanMutateWorkItem(workItem, actorUserId, actorRole);

      if (workItem.status !== FulfillmentWorkItemStatus.PENDING) {
        throw new ConflictException(`${type} work item is already ${workItem.status}`);
      }

      const result = await tx.fulfillmentWorkItem.updateMany({
        where: { id: workItem.id, version },
        data: {
          status: FulfillmentWorkItemStatus.IN_PROGRESS,
          startedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException('Work item changed; reload and try again');
      }

      await this.recomputeStatus(tx, fulfillmentOrderId);
      await this.recordEvent(
        tx,
        fulfillmentOrderId,
        `${type.toLowerCase()}.started`,
        actorUserId,
        {},
      );

      return this.reload(tx, fulfillmentOrderId);
    });
  }

  /**
   * Requires every active unit to be picked/packed and no open exception.
   * The ticket only states the exception guard for picking; it is applied to
   * packing too, since a pack-time exception (e.g. damage discovered while
   * packing) must equally pause completion for admin review.
   */
  async completeWork(
    fulfillmentOrderId: string,
    type: FulfillmentWorkItemType,
    version: number,
    actorUserId: string,
    actorRole: Role,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.prisma.$transaction(async (tx) => {
      const fo = await this.lockFulfillmentOrder(tx, fulfillmentOrderId);
      const workItem = this.requireWorkItem(fo, type);
      this.assertCanMutateWorkItem(workItem, actorUserId, actorRole);

      if (workItem.status !== FulfillmentWorkItemStatus.IN_PROGRESS) {
        throw new ConflictException(`${type} work item is not in progress`);
      }

      const openExceptions = await tx.fulfillmentException.count({
        where: { fulfillmentOrderId, status: FulfillmentExceptionStatus.OPEN },
      });
      if (openExceptions > 0) {
        throw new ConflictException(
          `Cannot complete ${type.toLowerCase()}ing while an exception is open`,
        );
      }

      const totalActive = sum(fo.lines, (l) => l.allocatedQuantity - l.cancelledQuantity);
      const totalDone =
        type === FulfillmentWorkItemType.PICK
          ? sum(fo.lines, (l) => Math.min(l.pickedQuantity, l.allocatedQuantity - l.cancelledQuantity))
          : sum(fo.lines, (l) => Math.min(l.packedQuantity, l.allocatedQuantity - l.cancelledQuantity));

      if (totalDone < totalActive) {
        throw new ConflictException(
          `Cannot complete ${type.toLowerCase()}ing until every active unit is ${
            type === FulfillmentWorkItemType.PICK ? 'picked' : 'packed'
          }`,
        );
      }

      const result = await tx.fulfillmentWorkItem.updateMany({
        where: { id: workItem.id, version },
        data: {
          status: FulfillmentWorkItemStatus.COMPLETED,
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException('Work item changed; reload and try again');
      }

      await this.recomputeStatus(tx, fulfillmentOrderId);
      await this.recordEvent(
        tx,
        fulfillmentOrderId,
        `${type.toLowerCase()}.completed`,
        actorUserId,
        {},
      );

      return this.reload(tx, fulfillmentOrderId);
    });
  }

  /** Backs both `POST .../picks` and `POST .../packs` — same shape, different ceiling. */
  async recordQuantities(
    fulfillmentOrderId: string,
    type: FulfillmentWorkItemType,
    lines: QuantityLineDto[],
    actorUserId: string,
    actorRole: Role,
    idempotencyKey: string,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.prisma.$transaction(async (tx) => {
      const fo = await this.lockFulfillmentOrder(tx, fulfillmentOrderId);

      const replay = await this.checkIdempotentReplay(tx, fulfillmentOrderId, idempotencyKey, {
        type: type === FulfillmentWorkItemType.PICK ? 'picks.recorded' : 'packs.recorded',
        payload: { lines },
      });
      if (replay) return replay;

      const workItem = this.requireWorkItem(fo, type);
      this.assertCanMutateWorkItem(workItem, actorUserId, actorRole);
      if (workItem.status !== FulfillmentWorkItemStatus.IN_PROGRESS) {
        throw new ConflictException(
          `${type} work item must be in progress to record ${
            type === FulfillmentWorkItemType.PICK ? 'picks' : 'packs'
          }`,
        );
      }

      const linesById = new Map(fo.lines.map((line) => [line.id, line]));
      for (const delta of lines) {
        const line = linesById.get(delta.fulfillmentLineId);
        if (!line) {
          throw new BadRequestException(
            `Fulfillment line ${delta.fulfillmentLineId} does not belong to this fulfillment order`,
          );
        }

        if (type === FulfillmentWorkItemType.PICK) {
          const ceiling = line.allocatedQuantity - line.cancelledQuantity;
          if (line.pickedQuantity + delta.quantity > ceiling) {
            throw new ConflictException(
              `Picking line ${line.id} would exceed the allocated-minus-cancelled quantity`,
            );
          }
          await tx.fulfillmentLine.update({
            where: { id: line.id },
            data: { pickedQuantity: { increment: delta.quantity } },
          });
        } else {
          if (line.packedQuantity + delta.quantity > line.pickedQuantity) {
            throw new ConflictException(
              `Packing line ${line.id} would exceed the picked quantity`,
            );
          }
          await tx.fulfillmentLine.update({
            where: { id: line.id },
            data: { packedQuantity: { increment: delta.quantity } },
          });
        }
      }

      try {
        await tx.fulfillmentEvent.create({
          data: {
            fulfillmentOrderId,
            type: type === FulfillmentWorkItemType.PICK ? 'picks.recorded' : 'packs.recorded',
            actorUserId,
            idempotencyKey,
            metadata: { lines } as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        throw this.mapWriteError(error);
      }

      await this.recomputeStatus(tx, fulfillmentOrderId);
      return this.reload(tx, fulfillmentOrderId);
    });
  }

  async createException(
    fulfillmentOrderId: string,
    dto: CreateExceptionDto,
    actorUserId: string,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.prisma.$transaction(async (tx) => {
      const fo = await this.lockFulfillmentOrder(tx, fulfillmentOrderId);
      const line = fo.lines.find((l) => l.id === dto.fulfillmentLineId);
      if (!line) {
        throw new BadRequestException(
          'Fulfillment line does not belong to this fulfillment order',
        );
      }

      const exception = await tx.fulfillmentException.create({
        data: {
          fulfillmentOrderId,
          fulfillmentLineId: line.id,
          type: dto.type,
          quantity: dto.quantity,
          reason: dto.reason,
        },
      });

      // hasOpenException now true — recomputeStatus surfaces ON_HOLD.
      await this.recomputeStatus(tx, fulfillmentOrderId);
      await this.recordEvent(tx, fulfillmentOrderId, 'exception.created', actorUserId, {
        exceptionId: exception.id,
        type: dto.type,
        quantity: dto.quantity,
      });

      return this.reload(tx, fulfillmentOrderId);
    });
  }

  /** Admin-only, enforced at the controller. */
  async resolveException(
    fulfillmentOrderId: string,
    exceptionId: string,
    dto: ResolveExceptionDto,
    actorUserId: string,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.prisma.$transaction(async (tx) => {
      const fo = await this.lockFulfillmentOrder(tx, fulfillmentOrderId);
      const exception = await tx.fulfillmentException.findUnique({
        where: { id: exceptionId },
      });
      if (!exception || exception.fulfillmentOrderId !== fulfillmentOrderId) {
        throw new NotFoundException('Exception not found');
      }
      if (exception.status !== FulfillmentExceptionStatus.OPEN) {
        return this.reload(tx, fulfillmentOrderId);
      }

      await tx.fulfillmentException.update({
        where: { id: exceptionId },
        data: {
          status: FulfillmentExceptionStatus.RESOLVED,
          resolvedByUserId: actorUserId,
          resolution: dto.resolution,
          resolvedAt: new Date(),
        },
      });

      if (dto.action === 'cancel_quantity') {
        const line = fo.lines.find((l) => l.id === exception.fulfillmentLineId);
        if (!line) {
          throw new ConflictException(
            'The line behind this exception no longer belongs to this fulfillment order',
          );
        }
        await this.applyCancellation(
          tx,
          fo,
          [{ line, quantity: exception.quantity }],
          dto.resolution,
        );
      }

      await this.recomputeStatus(tx, fulfillmentOrderId);
      await this.recordEvent(tx, fulfillmentOrderId, 'exception.resolved', actorUserId, {
        exceptionId,
        action: dto.action,
      });

      return this.reload(tx, fulfillmentOrderId);
    });
  }

  /**
   * #29 changes this contract: a dispatch always references exactly one
   * booked shipment and consumes only that shipment's lines — it no longer
   * accepts arbitrary line quantities, since booking (ShipmentsService) is
   * what claims packed quantity via FulfillmentLine.shipmentAssignedQuantity.
   */
  async dispatch(
    fulfillmentOrderId: string,
    shipmentId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<FulfillmentDispatchWithLines> {
    return this.prisma.$transaction(async (tx) => {
      const fo = await this.lockFulfillmentOrder(tx, fulfillmentOrderId);

      const existing = await tx.fulfillmentDispatch.findUnique({
        where: { idempotencyKey },
        include: { lines: true },
      });
      if (existing) {
        if (
          existing.fulfillmentOrderId !== fulfillmentOrderId ||
          existing.shipmentId !== shipmentId
        ) {
          throw new ConflictException(
            'Idempotency-Key already used for a different request',
          );
        }
        return existing;
      }

      const openExceptions = await tx.fulfillmentException.count({
        where: { fulfillmentOrderId, status: FulfillmentExceptionStatus.OPEN },
      });
      if (openExceptions > 0) {
        throw new ConflictException('Cannot dispatch while an exception is open');
      }

      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        include: { lines: true },
      });
      if (!shipment || shipment.fulfillmentOrderId !== fulfillmentOrderId) {
        throw new BadRequestException(
          `Shipment ${shipmentId} does not belong to this fulfillment order`,
        );
      }
      if (shipment.status !== ShipmentStatus.BOOKED) {
        throw new ConflictException(
          'Shipment must be booked before it can be dispatched',
        );
      }

      const linesById = new Map(fo.lines.map((line) => [line.id, line]));
      const deltas: { lineId: string; quantity: number }[] = [];
      for (const shipmentLine of shipment.lines) {
        const line = linesById.get(shipmentLine.fulfillmentLineId);
        if (!line) {
          throw new ConflictException(
            `Fulfillment line ${shipmentLine.fulfillmentLineId} no longer belongs to this fulfillment order`,
          );
        }
        const dispatchable = line.shipmentAssignedQuantity - line.dispatchedQuantity;
        if (shipmentLine.quantity > dispatchable) {
          throw new ConflictException(
            `Shipment line quantity for line ${line.id} exceeds its assigned-but-undispatched quantity`,
          );
        }
        await tx.fulfillmentLine.update({
          where: { id: line.id },
          data: { dispatchedQuantity: { increment: shipmentLine.quantity } },
        });
        deltas.push({ lineId: line.id, quantity: shipmentLine.quantity });
      }

      const dispatchNumber = await this.numberingService.nextFulfillmentDispatchNumber(tx);
      let dispatch: FulfillmentDispatchWithLines;
      try {
        dispatch = await tx.fulfillmentDispatch.create({
          data: {
            fulfillmentOrderId,
            shipmentId,
            dispatchNumber,
            idempotencyKey,
            dispatchedByUserId: actorUserId,
            lines: {
              create: deltas.map((delta) => ({
                fulfillmentLineId: delta.lineId,
                quantity: delta.quantity,
              })),
            },
          },
          include: { lines: true },
        });
      } catch (error) {
        throw this.mapWriteError(error);
      }

      await tx.shipment.update({
        where: { id: shipmentId },
        data: { status: ShipmentStatus.DISPATCHED, dispatchedAt: new Date() },
      });

      await this.recomputeStatus(tx, fulfillmentOrderId);
      await this.recordEvent(tx, fulfillmentOrderId, 'dispatched', actorUserId, {
        dispatchId: dispatch.id,
        dispatchNumber,
        shipmentId,
      });
      await this.outboxService.record(
        {
          topic: 'fulfillment.dispatched',
          aggregateType: 'FulfillmentDispatch',
          aggregateId: dispatch.id,
          payload: { fulfillmentOrderId, orderId: fo.orderId, dispatchNumber, shipmentId, lines: deltas },
        },
        tx,
      );

      return dispatch;
    });
  }

  /**
   * Claims packed-but-unassigned quantity for a shipment being booked (#29).
   * Called by ShipmentsService from within its own transaction, alongside
   * the Shipment row it's creating, so the claim and the shipment always
   * commit or roll back together.
   */
  async assignShipmentQuantity(
    tx: Prisma.TransactionClient,
    fulfillmentOrderId: string,
    entries: { fulfillmentLineId: string; quantity: number }[],
  ): Promise<LockedFulfillmentOrder> {
    const fo = await this.lockFulfillmentOrder(tx, fulfillmentOrderId);
    for (const entry of entries) {
      const line = fo.lines.find((l) => l.id === entry.fulfillmentLineId);
      if (!line) {
        throw new BadRequestException(
          `Fulfillment line ${entry.fulfillmentLineId} does not belong to this fulfillment order`,
        );
      }
      const assignable = line.packedQuantity - line.shipmentAssignedQuantity;
      if (entry.quantity > assignable) {
        throw new ConflictException(
          `Line ${line.id} does not have enough packed-but-unassigned quantity`,
        );
      }
      await tx.fulfillmentLine.update({
        where: { id: line.id },
        data: { shipmentAssignedQuantity: { increment: entry.quantity } },
      });
    }
    return fo;
  }

  /** Releases a shipment-assignment claim — called when a shipment is
   * cancelled before dispatch (#29). */
  async releaseShipmentQuantity(
    tx: Prisma.TransactionClient,
    fulfillmentOrderId: string,
    entries: { fulfillmentLineId: string; quantity: number }[],
  ): Promise<void> {
    await this.lockFulfillmentOrder(tx, fulfillmentOrderId);
    for (const entry of entries) {
      await tx.fulfillmentLine.update({
        where: { id: entry.fulfillmentLineId },
        data: { shipmentAssignedQuantity: { decrement: entry.quantity } },
      });
    }
  }

  /** Admin-only, enforced at the controller. */
  async cancel(
    fulfillmentOrderId: string,
    dto: CancelLinesDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<FulfillmentOrderWithDetail> {
    return this.prisma.$transaction(async (tx) => {
      const fo = await this.lockFulfillmentOrder(tx, fulfillmentOrderId);

      const replay = await this.checkIdempotentReplay(tx, fulfillmentOrderId, idempotencyKey, {
        type: 'lines.cancelled',
        payload: { lines: dto.lines, reason: dto.reason },
      });
      if (replay) return replay;

      const linesById = new Map(fo.lines.map((line) => [line.id, line]));
      const entries = dto.lines.map((requested) => {
        const line = linesById.get(requested.fulfillmentLineId);
        if (!line) {
          throw new BadRequestException(
            `Fulfillment line ${requested.fulfillmentLineId} does not belong to this fulfillment order`,
          );
        }
        return { line, quantity: requested.quantity };
      });

      await this.applyCancellation(tx, fo, entries, dto.reason);

      try {
        await tx.fulfillmentEvent.create({
          data: {
            fulfillmentOrderId,
            type: 'lines.cancelled',
            actorUserId,
            idempotencyKey,
            metadata: { lines: dto.lines, reason: dto.reason } as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        throw this.mapWriteError(error);
      }

      await this.recomputeStatus(tx, fulfillmentOrderId);
      return this.reload(tx, fulfillmentOrderId);
    });
  }

  /**
   * Shared by `cancel()` and exception resolution's `cancel_quantity` path.
   * Only the cancelled delta ever moves — picked/packed counters are left as
   * a historical record of physical work already done, per the
   * `cancelled + dispatched <= allocated` invariant (not
   * `cancelled <= allocated - picked`).
   */
  private async applyCancellation(
    tx: Prisma.TransactionClient,
    fo: LockedFulfillmentOrder,
    entries: { line: FulfillmentLine; quantity: number }[],
    reason: string,
  ): Promise<void> {
    for (const { line, quantity } of entries) {
      const activeUndispatched =
        line.allocatedQuantity - line.cancelledQuantity - line.dispatchedQuantity;
      if (quantity > activeUndispatched) {
        throw new ConflictException(
          `Cannot cancel more than the undispatched active quantity for line ${line.id}`,
        );
      }

      await tx.fulfillmentLine.update({
        where: { id: line.id },
        data: { cancelledQuantity: { increment: quantity } },
      });

      await this.inventoryService.returnCancelledStock(
        tx,
        fo.warehouseId,
        line.variantId,
        quantity,
        { referenceType: 'fulfillment_cancellation_line', referenceId: line.id },
        reason,
      );
    }

    await this.outboxService.record(
      {
        topic: 'fulfillment.refund_required',
        aggregateType: 'FulfillmentOrder',
        aggregateId: fo.id,
        payload: {
          orderId: fo.orderId,
          sellerOrderId: fo.sellerOrderId,
          lines: entries.map((entry) => ({
            fulfillmentLineId: entry.line.id,
            orderItemId: entry.line.orderItemId,
            quantity: entry.quantity,
          })),
          reason,
        },
      },
      tx,
    );
  }

  private assertCanMutateWorkItem(
    workItem: FulfillmentWorkItem,
    actorUserId: string,
    actorRole: Role,
  ): void {
    if (actorRole === Role.ADMIN) return;
    if (workItem.assignedUserId !== actorUserId) {
      throw new ForbiddenException(
        'Only the assigned staff member or an administrator may act on this work item',
      );
    }
  }

  private requireWorkItem(
    fo: LockedFulfillmentOrder,
    type: FulfillmentWorkItemType,
  ): FulfillmentWorkItem {
    const workItem = fo.workItems.find((item) => item.type === type);
    if (!workItem) throw new NotFoundException(`${type} work item not found`);
    return workItem;
  }

  /**
   * A replayed request for a command whose idempotency key is already
   * attached to a FulfillmentEvent on this fulfillment order returns the
   * current state unchanged rather than reapplying — the row lock already
   * held by the caller makes this race-free against a concurrent duplicate.
   */
  private async checkIdempotentReplay(
    tx: Prisma.TransactionClient,
    fulfillmentOrderId: string,
    idempotencyKey: string,
    expected: { type: string; payload: unknown },
  ): Promise<FulfillmentOrderWithDetail | null> {
    const existing = await tx.fulfillmentEvent.findUnique({ where: { idempotencyKey } });
    if (!existing) return null;
    const samePayload =
      stableStringify(existing.metadata) === stableStringify(expected.payload);
    if (
      existing.fulfillmentOrderId !== fulfillmentOrderId ||
      existing.type !== expected.type ||
      !samePayload
    ) {
      throw new ConflictException(
        'Idempotency-Key already used for a different request',
      );
    }
    return this.reload(tx, fulfillmentOrderId);
  }

  private async lockFulfillmentOrder(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<LockedFulfillmentOrder> {
    await tx.$queryRaw`SELECT id FROM fulfillment_orders WHERE id = ${id}::uuid FOR UPDATE`;
    const fo = await tx.fulfillmentOrder.findUnique({
      where: { id },
      include: { lines: true, workItems: true },
    });
    if (!fo) throw new NotFoundException('Fulfillment order not found');
    return fo;
  }

  private async recomputeStatus(
    tx: Prisma.TransactionClient,
    fulfillmentOrderId: string,
  ): Promise<void> {
    const lines = await tx.fulfillmentLine.findMany({ where: { fulfillmentOrderId } });
    const workItems = await tx.fulfillmentWorkItem.findMany({ where: { fulfillmentOrderId } });
    const openExceptionCount = await tx.fulfillmentException.count({
      where: { fulfillmentOrderId, status: FulfillmentExceptionStatus.OPEN },
    });
    const pickWorkItem = workItems.find((w) => w.type === FulfillmentWorkItemType.PICK);
    const packWorkItem = workItems.find((w) => w.type === FulfillmentWorkItemType.PACK);

    const status = deriveFulfillmentStatus({
      lines,
      pickWorkItemStatus: pickWorkItem?.status ?? FulfillmentWorkItemStatus.PENDING,
      packWorkItemStatus: packWorkItem?.status ?? FulfillmentWorkItemStatus.PENDING,
      hasOpenException: openExceptionCount > 0,
    });

    await tx.fulfillmentOrder.update({
      where: { id: fulfillmentOrderId },
      data: { status, version: { increment: 1 } },
    });
  }

  private recordEvent(
    tx: Prisma.TransactionClient,
    fulfillmentOrderId: string,
    type: string,
    actorUserId: string,
    metadata: Record<string, unknown>,
  ): Promise<Prisma.FulfillmentEventGetPayload<object>> {
    return tx.fulfillmentEvent.create({
      data: {
        fulfillmentOrderId,
        type,
        actorUserId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private reload(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<FulfillmentOrderWithDetail> {
    return tx.fulfillmentOrder.findUniqueOrThrow({
      where: { id },
      include: { lines: true, workItems: true, exceptions: true },
    });
  }

  private mapWriteError(error: unknown): unknown {
    if (this.isPrismaError(error, 'P2002')) {
      return new ConflictException('Idempotency-Key already used');
    }
    return error;
  }

  private isPrismaError(
    error: unknown,
    code: string,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === code
    );
  }
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}
