import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GoodsReceiptStatus,
  Prisma,
  PurchaseOrderLine,
  PurchaseOrderStatus,
} from '@prisma/client';

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from '../../../common/pagination/pagination-query.dto';
import { PrismaService } from '../../../database/prisma.service';
import { WarehousesService } from '../../inventory/warehouses/warehouses.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../../infrastructure/jobs/outbox.service';
import { NumberingService } from '../numbering.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { CreatePurchaseOrderLineDto } from './dto/create-purchase-order-line.dto';
import { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { computeLineAmounts, computeOrderTotals } from './purchase-order-math';
import { assertPurchaseOrderTransition } from './purchase-order-status';
import { PurchaseOrderPage, PurchaseOrderWithLines } from './purchase-orders.types';

const OPEN_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.DRAFT,
  PurchaseOrderStatus.SUBMITTED,
  PurchaseOrderStatus.APPROVED,
  PurchaseOrderStatus.ORDERED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

const RECEIVABLE_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.ORDERED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

type LineTotals = ReturnType<typeof computeLineAmounts>;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppliersService: SuppliersService,
    private readonly warehousesService: WarehousesService,
    private readonly numberingService: NumberingService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  async findAll(query: ListPurchaseOrdersDto): Promise<PurchaseOrderPage> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.awaitingApproval
        ? { status: PurchaseOrderStatus.SUBMITTED }
        : {}),
      ...(query.overdue
        ? {
            status: { in: OPEN_STATUSES },
            expectedDeliveryDate: { lt: new Date() },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        include: { lines: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: string): Promise<PurchaseOrderWithLines> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }

    return po;
  }

  async create(
    dto: CreatePurchaseOrderDto,
    actorUserId: string,
  ): Promise<PurchaseOrderWithLines> {
    await this.suppliersService.requireActive(dto.supplierId);
    const warehouse = await this.warehousesService.findById(dto.warehouseId);
    if (!warehouse.isActive) {
      throw new ConflictException('Warehouse is not active');
    }

    const lineAmounts = dto.lines.map((line) => ({
      line,
      amounts: computeLineAmounts({
        orderedQuantity: line.orderedQuantity,
        unitCostAmount: line.unitCostAmount,
        discountAmount: line.discountAmount ?? 0,
        taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
      }),
    }));
    const totals = computeOrderTotals(
      lineAmounts.map((l) => l.amounts),
      dto.shippingAmount ?? 0,
    );

    return this.prisma.$transaction(async (tx) => {
      const poNumber = await this.numberingService.nextPurchaseOrderNumber(tx);

      const po = await tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId,
          currency: dto.currency,
          shippingAmount: dto.shippingAmount ?? 0,
          subtotalAmount: totals.subtotalAmount,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          expectedDeliveryDate: dto.expectedDeliveryDate
            ? new Date(dto.expectedDeliveryDate)
            : undefined,
          notes: dto.notes,
          createdByUserId: actorUserId,
          lines: {
            create: lineAmounts.map(({ line, amounts }) =>
              this.toLineCreateInput(line, dto.currency, amounts),
            ),
          },
        },
        include: { lines: true },
      });

      await this.auditService.record(
        {
          actorUserId,
          action: 'procurement.purchase_order.created',
          targetType: 'PurchaseOrder',
          targetId: po.id,
          metadata: { poNumber: po.poNumber, supplierId: po.supplierId },
        },
        tx,
      );

      return po;
    });
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    actorUserId: string,
  ): Promise<PurchaseOrderWithLines> {
    const po = await this.findById(id);
    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new ConflictException('Only a draft purchase order can be edited');
    }

    if (dto.supplierId) await this.suppliersService.requireActive(dto.supplierId);
    if (dto.warehouseId) {
      const warehouse = await this.warehousesService.findById(dto.warehouseId);
      if (!warehouse.isActive) {
        throw new ConflictException('Warehouse is not active');
      }
    }

    const currency = dto.currency ?? po.currency;
    const shippingAmount = dto.shippingAmount ?? po.shippingAmount;
    const lines = dto.lines;
    const lineAmounts = lines?.map((line) => ({
      line,
      amounts: computeLineAmounts({
        orderedQuantity: line.orderedQuantity,
        unitCostAmount: line.unitCostAmount,
        discountAmount: line.discountAmount ?? 0,
        taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
      }),
    }));
    const totals = lineAmounts
      ? computeOrderTotals(lineAmounts.map((l) => l.amounts), shippingAmount)
      : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (lineAmounts) {
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      }

      const result = await tx.purchaseOrder.updateMany({
        where: { id, version: dto.version },
        data: {
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId,
          currency,
          shippingAmount,
          notes: dto.notes,
          expectedDeliveryDate: dto.expectedDeliveryDate
            ? new Date(dto.expectedDeliveryDate)
            : undefined,
          ...(totals
            ? {
                subtotalAmount: totals.subtotalAmount,
                taxAmount: totals.taxAmount,
                totalAmount: totals.totalAmount,
              }
            : {}),
          version: { increment: 1 },
        },
      });

      if (result.count !== 1) {
        throw new ConflictException(
          'Purchase order changed; reload and try again',
        );
      }

      if (lineAmounts) {
        for (const { line, amounts } of lineAmounts) {
          await tx.purchaseOrderLine.create({
            data: {
              ...this.toLineCreateInput(line, currency, amounts),
              purchaseOrder: { connect: { id } },
            },
          });
        }
      }

      const saved = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
        include: { lines: true },
      });

      await this.auditService.record(
        {
          actorUserId,
          action: 'procurement.purchase_order.updated',
          targetType: 'PurchaseOrder',
          targetId: saved.id,
        },
        tx,
      );

      return saved;
    });

    return updated;
  }

  async submit(
    id: string,
    version: number,
    actorUserId: string,
  ): Promise<PurchaseOrderWithLines> {
    return this.transition(
      id,
      version,
      PurchaseOrderStatus.SUBMITTED,
      { submittedAt: new Date() },
      async (tx, po) => {
        await this.auditService.record(
          {
            actorUserId,
            action: 'procurement.purchase_order.submitted',
            targetType: 'PurchaseOrder',
            targetId: po.id,
          },
          tx,
        );
        await this.outboxService.record(
          {
            topic: 'procurement.po.submitted',
            aggregateType: 'PurchaseOrder',
            aggregateId: po.id,
            payload: { poNumber: po.poNumber },
          },
          tx,
        );
      },
    );
  }

  async returnToDraft(
    id: string,
    version: number,
    reason: string,
    actorUserId: string,
  ): Promise<PurchaseOrderWithLines> {
    return this.transition(
      id,
      version,
      PurchaseOrderStatus.DRAFT,
      { submittedAt: null },
      async (tx, po) => {
        await this.auditService.record(
          {
            actorUserId,
            action: 'procurement.purchase_order.returned_to_draft',
            targetType: 'PurchaseOrder',
            targetId: po.id,
            metadata: { reason },
          },
          tx,
        );
      },
    );
  }

  /** A submitter may never approve their own purchase order. */
  async approve(
    id: string,
    version: number,
    actorUserId: string,
  ): Promise<PurchaseOrderWithLines> {
    const existing = await this.findById(id);
    if (existing.createdByUserId === actorUserId) {
      throw new ForbiddenException(
        'You cannot approve a purchase order you created',
      );
    }

    return this.transition(
      id,
      version,
      PurchaseOrderStatus.APPROVED,
      { approvedByUserId: actorUserId, approvedAt: new Date() },
      async (tx, po) => {
        await this.auditService.record(
          {
            actorUserId,
            action: 'procurement.purchase_order.approved',
            targetType: 'PurchaseOrder',
            targetId: po.id,
          },
          tx,
        );
        await this.outboxService.record(
          {
            topic: 'procurement.po.approved',
            aggregateType: 'PurchaseOrder',
            aggregateId: po.id,
            payload: { poNumber: po.poNumber },
          },
          tx,
        );
      },
    );
  }

  async reject(
    id: string,
    version: number,
    reason: string,
    actorUserId: string,
  ): Promise<PurchaseOrderWithLines> {
    return this.transition(
      id,
      version,
      PurchaseOrderStatus.REJECTED,
      { rejectedByUserId: actorUserId, rejectionReason: reason },
      async (tx, po) => {
        await this.auditService.record(
          {
            actorUserId,
            action: 'procurement.purchase_order.rejected',
            targetType: 'PurchaseOrder',
            targetId: po.id,
            metadata: { reason },
          },
          tx,
        );
      },
    );
  }

  async place(
    id: string,
    version: number,
    actorUserId: string,
  ): Promise<PurchaseOrderWithLines> {
    return this.transition(
      id,
      version,
      PurchaseOrderStatus.ORDERED,
      { orderedAt: new Date() },
      async (tx, po) => {
        await this.auditService.record(
          {
            actorUserId,
            action: 'procurement.purchase_order.ordered',
            targetType: 'PurchaseOrder',
            targetId: po.id,
          },
          tx,
        );
        await this.outboxService.record(
          {
            topic: 'procurement.po.ordered',
            aggregateType: 'PurchaseOrder',
            aggregateId: po.id,
            payload: { poNumber: po.poNumber },
          },
          tx,
        );
      },
    );
  }

  async cancel(
    id: string,
    version: number,
    reason: string,
    actorUserId: string,
  ): Promise<PurchaseOrderWithLines> {
    const existing = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { goodsReceipts: true },
    });
    if (!existing) throw new NotFoundException('Purchase order not found');

    if (
      existing.goodsReceipts.some(
        (r) => r.status === GoodsReceiptStatus.POSTED,
      )
    ) {
      throw new ConflictException(
        'A purchase order with posted receipts cannot be cancelled; use close-short instead',
      );
    }

    return this.transition(
      id,
      version,
      PurchaseOrderStatus.CANCELLED,
      { cancellationReason: reason },
      async (tx, po) => {
        await this.auditService.record(
          {
            actorUserId,
            action: 'procurement.purchase_order.cancelled',
            targetType: 'PurchaseOrder',
            targetId: po.id,
            metadata: { reason },
          },
          tx,
        );
      },
    );
  }

  async closeShort(
    id: string,
    version: number,
    reason: string,
    actorUserId: string,
  ): Promise<PurchaseOrderWithLines> {
    const existing = await this.findById(id);
    assertPurchaseOrderTransition(
      existing.status,
      PurchaseOrderStatus.CLOSED_SHORT,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.purchaseOrder.updateMany({
        where: { id, version },
        data: {
          status: PurchaseOrderStatus.CLOSED_SHORT,
          shortCloseReason: reason,
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException(
          'Purchase order changed; reload and try again',
        );
      }

      // The remaining outstanding quantity is formally cancelled so it stops
      // counting as open in reporting; the historical orderedQuantity is
      // left untouched for the audit trail.
      for (const line of existing.lines) {
        const outstanding =
          line.orderedQuantity - line.receivedQuantity - line.cancelledQuantity;
        if (outstanding > 0) {
          await tx.purchaseOrderLine.update({
            where: { id: line.id },
            data: { cancelledQuantity: { increment: outstanding } },
          });
        }
      }

      const closed = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
        include: { lines: true },
      });

      await this.auditService.record(
        {
          actorUserId,
          action: 'procurement.purchase_order.closed_short',
          targetType: 'PurchaseOrder',
          targetId: closed.id,
          metadata: { reason },
        },
        tx,
      );

      return closed;
    });

    return updated;
  }

  /**
   * Amending an APPROVED/ORDERED purchase order creates a numbered revision
   * instead of mutating it in place — the original stays exactly as it was
   * approved/ordered until whoever manages the revision explicitly cancels
   * it once the revision itself is ready to take over.
   */
  async createRevision(
    id: string,
    actorUserId: string,
  ): Promise<PurchaseOrderWithLines> {
    const existing = await this.findById(id);
    if (
      existing.status !== PurchaseOrderStatus.APPROVED &&
      existing.status !== PurchaseOrderStatus.ORDERED
    ) {
      throw new ConflictException(
        'Only an approved or ordered purchase order can be revised',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const poNumber = await this.numberingService.nextPurchaseOrderNumber(tx);

      const revision = await tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId: existing.supplierId,
          warehouseId: existing.warehouseId,
          currency: existing.currency,
          shippingAmount: existing.shippingAmount,
          subtotalAmount: existing.subtotalAmount,
          taxAmount: existing.taxAmount,
          totalAmount: existing.totalAmount,
          expectedDeliveryDate: existing.expectedDeliveryDate,
          notes: existing.notes,
          revisionNumber: existing.revisionNumber + 1,
          supersedesId: existing.id,
          createdByUserId: actorUserId,
          lines: {
            create: existing.lines.map((line) => ({
              variantId: line.variantId,
              supplierSku: line.supplierSku,
              packSize: line.packSize,
              orderedQuantity: line.orderedQuantity,
              unitCostAmount: line.unitCostAmount,
              discountAmount: line.discountAmount,
              taxRateBasisPoints: line.taxRateBasisPoints,
              taxAmount: line.taxAmount,
              netAmount: line.netAmount,
              grossAmount: line.grossAmount,
              currency: line.currency,
            })),
          },
        },
        include: { lines: true },
      });

      await this.auditService.record(
        {
          actorUserId,
          action: 'procurement.purchase_order.revised',
          targetType: 'PurchaseOrder',
          targetId: revision.id,
          metadata: { supersedesId: existing.id, supersedesPoNumber: existing.poNumber },
        },
        tx,
      );

      return revision;
    });
  }

  /**
   * Locks the purchase order and its lines for a goods receipt about to be
   * posted against it. Called by GoodsReceiptsService from within its own
   * transaction so the lock is held for the whole receiving operation.
   */
  async lockForReceiving(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<PurchaseOrderWithLines> {
    const po = await this.lockRow(tx, id);
    if (!RECEIVABLE_STATUSES.includes(po.status)) {
      throw new ConflictException(
        `Cannot receive against a purchase order with status ${po.status}`,
      );
    }
    return po;
  }

  /** Locks the row with no status check — used when reversing a receipt,
   * which must be possible against RECEIVED/PARTIALLY_RECEIVED/CLOSED_SHORT
   * purchase orders, not just the ones currently open for receiving. */
  async lockRow(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<PurchaseOrderWithLines> {
    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${id}::uuid FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  /**
   * Applies accepted quantities to PO lines and derives the PO's new status.
   * Must run inside the same transaction as the inventory movements and
   * goods-receipt rows it accompanies.
   */
  async applyReceivedQuantities(
    tx: Prisma.TransactionClient,
    po: PurchaseOrderWithLines,
    deltas: { purchaseOrderLineId: string; acceptedQuantity: number }[],
  ): Promise<PurchaseOrderStatus> {
    for (const delta of deltas) {
      if (delta.acceptedQuantity <= 0) continue;
      await tx.purchaseOrderLine.update({
        where: { id: delta.purchaseOrderLineId },
        data: { receivedQuantity: { increment: delta.acceptedQuantity } },
      });
    }

    const refreshedLines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: po.id },
    });
    const newStatus = this.deriveStatus(refreshedLines);

    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: newStatus,
        completedAt:
          newStatus === PurchaseOrderStatus.RECEIVED ? new Date() : null,
        version: { increment: 1 },
      },
    });

    return newStatus;
  }

  /** The inverse of applyReceivedQuantities, used when a receipt is reversed. */
  async reverseReceivedQuantities(
    tx: Prisma.TransactionClient,
    poId: string,
    deltas: { purchaseOrderLineId: string; acceptedQuantity: number }[],
  ): Promise<PurchaseOrderStatus> {
    for (const delta of deltas) {
      if (delta.acceptedQuantity <= 0) continue;
      await tx.purchaseOrderLine.update({
        where: { id: delta.purchaseOrderLineId },
        data: { receivedQuantity: { decrement: delta.acceptedQuantity } },
      });
    }

    const refreshedLines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: poId },
    });
    const newStatus = this.deriveStatus(refreshedLines);

    await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: newStatus,
        completedAt: newStatus === PurchaseOrderStatus.RECEIVED ? new Date() : null,
        version: { increment: 1 },
      },
    });

    return newStatus;
  }

  private deriveStatus(lines: PurchaseOrderLine[]): PurchaseOrderStatus {
    const fullyResolved = lines.every(
      (line) =>
        line.receivedQuantity + line.cancelledQuantity >= line.orderedQuantity,
    );
    if (fullyResolved) return PurchaseOrderStatus.RECEIVED;

    const anyReceived = lines.some((line) => line.receivedQuantity > 0);
    return anyReceived
      ? PurchaseOrderStatus.PARTIALLY_RECEIVED
      : PurchaseOrderStatus.ORDERED;
  }

  /**
   * `effects` writes the audit event (and any outbox events) inside the same
   * transaction as the status change, so a later failure there rolls back
   * the status change too rather than leaving it unexplained.
   */
  private async transition(
    id: string,
    version: number,
    to: PurchaseOrderStatus,
    data: Prisma.PurchaseOrderUpdateManyMutationInput,
    effects: (
      tx: Prisma.TransactionClient,
      po: PurchaseOrderWithLines,
    ) => Promise<void>,
  ): Promise<PurchaseOrderWithLines> {
    const existing = await this.findById(id);
    assertPurchaseOrderTransition(existing.status, to);

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.purchaseOrder.updateMany({
        where: { id, version },
        data: { ...data, status: to, version: { increment: 1 } },
      });

      if (result.count !== 1) {
        throw new ConflictException(
          'Purchase order changed; reload and try again',
        );
      }

      const po = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
        include: { lines: true },
      });

      await effects(tx, po);

      return po;
    });
  }

  private toLineCreateInput(
    line: CreatePurchaseOrderLineDto,
    currency: string,
    amounts: LineTotals,
  ): Prisma.PurchaseOrderLineCreateWithoutPurchaseOrderInput {
    if (line.orderedQuantity <= 0) {
      throw new BadRequestException('orderedQuantity must be positive');
    }

    return {
      variant: { connect: { id: line.variantId } },
      supplierSku: line.supplierSku,
      packSize: line.packSize ?? 1,
      orderedQuantity: line.orderedQuantity,
      unitCostAmount: line.unitCostAmount,
      discountAmount: line.discountAmount ?? 0,
      taxRateBasisPoints: line.taxRateBasisPoints ?? 0,
      taxAmount: amounts.taxAmount,
      netAmount: amounts.netAmount,
      grossAmount: amounts.grossAmount,
      currency,
    };
  }
}
