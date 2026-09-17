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
  PurchaseOrderStatus,
  Role,
} from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../../infrastructure/jobs/outbox.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryService } from '../../inventory/inventory.service';
import { NumberingService } from '../../../common/numbering/numbering.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { PurchaseOrderWithLines } from '../purchase-orders/purchase-orders.types';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { GoodsReceiptLineDto } from './dto/goods-receipt-line.dto';
import { GoodsReceiptWithLines } from './goods-receipts.types';

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly inventoryService: InventoryService,
    private readonly numberingService: NumberingService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  async findById(id: string): Promise<GoodsReceiptWithLines> {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!receipt) {
      throw new NotFoundException('Goods receipt not found');
    }

    return receipt;
  }

  listForPurchaseOrder(purchaseOrderId: string): Promise<GoodsReceiptWithLines[]> {
    return this.prisma.goodsReceipt.findMany({
      where: { purchaseOrderId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Creates a DRAFT receipt (never touches inventory) and, unless
   * `dto.post === false`, immediately posts it — the common "scan and
   * finalize in one step" path. Splitting create from post lets staff key in
   * a large delivery before committing it, per the draft/posted/reversed
   * receipt lifecycle.
   */
  async createAndMaybePost(
    purchaseOrderId: string,
    dto: CreateGoodsReceiptDto,
    actorUserId: string,
    actorRole: Role,
    idempotencyKey?: string,
  ): Promise<GoodsReceiptWithLines> {
    if (idempotencyKey) {
      const existing = await this.prisma.goodsReceipt.findFirst({
        where: { idempotencyKey, purchaseOrderId },
        include: { lines: true },
      });
      if (existing) {
        return existing.status === GoodsReceiptStatus.DRAFT && dto.post !== false
          ? this.post(existing.id, actorUserId, actorRole, idempotencyKey)
          : existing;
      }
    }

    const po = await this.purchaseOrdersService.findById(purchaseOrderId);
    this.assertReconciled(dto.lines);
    this.assertExcessAuthorized(dto.lines, actorRole);

    if (dto.supplierDeliveryNoteRef) {
      await this.assertNoDuplicateDeliveryNote(
        po.supplierId,
        dto.supplierDeliveryNoteRef,
      );
    }

    const poLinesById = new Map(po.lines.map((line) => [line.id, line]));
    const seenPoLineIds = new Set<string>();
    for (const line of dto.lines) {
      const poLine = poLinesById.get(line.purchaseOrderLineId);
      if (!poLine) {
        throw new BadRequestException(
          `Purchase order line ${line.purchaseOrderLineId} does not belong to this purchase order`,
        );
      }
      if (seenPoLineIds.has(line.purchaseOrderLineId)) {
        throw new BadRequestException(
          `Purchase order line ${line.purchaseOrderLineId} appears more than once on this receipt`,
        );
      }
      seenPoLineIds.add(line.purchaseOrderLineId);

      const outstanding =
        poLine.orderedQuantity - poLine.receivedQuantity - poLine.cancelledQuantity;
      this.assertDiscrepancyExplained(line, line.acceptedQuantity - outstanding);
    }

    let draft: GoodsReceiptWithLines;
    try {
      draft = await this.prisma.$transaction(async (tx) => {
        const receiptNumber = await this.numberingService.nextGoodsReceiptNumber(tx);

        return tx.goodsReceipt.create({
          data: {
            receiptNumber,
            purchaseOrderId,
            warehouseId: dto.warehouseId,
            supplierDeliveryNoteRef: dto.supplierDeliveryNoteRef,
            receivedByUserId: actorUserId,
            idempotencyKey,
            lines: {
              create: dto.lines.map((line) => ({
                purchaseOrderLineId: line.purchaseOrderLineId,
                deliveredQuantity: line.deliveredQuantity,
                acceptedQuantity: line.acceptedQuantity,
                rejectedQuantity: line.rejectedQuantity ?? 0,
                damagedQuantity: line.damagedQuantity ?? 0,
                authorizedExcessQty: line.authorizedExcessQty ?? 0,
                discrepancyReason: line.discrepancyReason,
              })),
            },
          },
          include: { lines: true },
        });
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }

    await this.auditService.record({
      actorUserId,
      action: 'procurement.goods_receipt.drafted',
      targetType: 'GoodsReceipt',
      targetId: draft.id,
      metadata: { purchaseOrderId, poNumber: po.poNumber },
    });

    if (dto.post === false) {
      return draft;
    }

    return this.post(draft.id, actorUserId, actorRole, idempotencyKey);
  }

  /**
   * Only a DRAFT receipt may be edited — a posted one is immutable. The
   * DRAFT check is re-verified after locking the row, inside the same
   * transaction as the write: a `post()` that started (and locked the row)
   * between our pre-check and this call must not be silently overwritten
   * once it commits.
   */
  async updateDraft(
    id: string,
    dto: CreateGoodsReceiptDto,
    actorUserId: string,
    actorRole: Role,
  ): Promise<GoodsReceiptWithLines> {
    const receipt = await this.findById(id);
    if (receipt.status !== GoodsReceiptStatus.DRAFT) {
      throw new ConflictException('Only a draft goods receipt can be edited');
    }

    const po = await this.purchaseOrdersService.findById(receipt.purchaseOrderId);
    this.assertReconciled(dto.lines);
    this.assertExcessAuthorized(dto.lines, actorRole);

    const poLinesById = new Map(po.lines.map((line) => [line.id, line]));
    const seenPoLineIds = new Set<string>();
    for (const line of dto.lines) {
      const poLine = poLinesById.get(line.purchaseOrderLineId);
      if (!poLine) {
        throw new BadRequestException(
          `Purchase order line ${line.purchaseOrderLineId} does not belong to this purchase order`,
        );
      }
      if (seenPoLineIds.has(line.purchaseOrderLineId)) {
        throw new BadRequestException(
          `Purchase order line ${line.purchaseOrderLineId} appears more than once on this receipt`,
        );
      }
      seenPoLineIds.add(line.purchaseOrderLineId);

      const outstanding =
        poLine.orderedQuantity - poLine.receivedQuantity - poLine.cancelledQuantity;
      this.assertDiscrepancyExplained(line, line.acceptedQuantity - outstanding);
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockAndRequireDraft(tx, id);

      await tx.goodsReceiptLine.deleteMany({ where: { goodsReceiptId: id } });
      return tx.goodsReceipt.update({
        where: { id: locked.id },
        data: {
          warehouseId: dto.warehouseId,
          supplierDeliveryNoteRef: dto.supplierDeliveryNoteRef,
          lines: {
            create: dto.lines.map((line) => ({
              purchaseOrderLineId: line.purchaseOrderLineId,
              deliveredQuantity: line.deliveredQuantity,
              acceptedQuantity: line.acceptedQuantity,
              rejectedQuantity: line.rejectedQuantity ?? 0,
              damagedQuantity: line.damagedQuantity ?? 0,
              authorizedExcessQty: line.authorizedExcessQty ?? 0,
              discrepancyReason: line.discrepancyReason,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  /**
   * Only a DRAFT receipt may be abandoned — a posted one is immutable and
   * must instead be reversed. Same lock-then-recheck pattern as
   * `updateDraft`, so a `post()` racing this delete cannot have its row
   * vanish out from under it.
   */
  async deleteDraft(id: string, actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockAndRequireDraft(tx, id);
      await tx.goodsReceipt.delete({ where: { id: locked.id } });
    });

    await this.auditService.record({
      actorUserId,
      action: 'procurement.goods_receipt.draft_deleted',
      targetType: 'GoodsReceipt',
      targetId: id,
    });
  }

  /** Locks the receipt row and re-reads its status under that lock — used by
   * both draft mutators so a concurrent `post()` can never race a draft edit
   * or delete. */
  private async lockAndRequireDraft(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<{ id: string; status: GoodsReceiptStatus }> {
    await tx.$queryRaw`SELECT id FROM goods_receipts WHERE id = ${id}::uuid FOR UPDATE`;
    const receipt = await tx.goodsReceipt.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!receipt) throw new NotFoundException('Goods receipt not found');
    if (receipt.status !== GoodsReceiptStatus.DRAFT) {
      throw new ConflictException(
        'Goods receipt is no longer a draft; reload and try again',
      );
    }
    return receipt;
  }

  /**
   * The single atomic operation: lock the PO and its lines, validate every
   * quantity, post the (immutable) receipt, move stock through
   * InventoryService, roll the PO's status forward, and write the audit +
   * outbox events — all inside one transaction, so a failure on any stock
   * line leaves neither the receipt nor any inventory increase behind.
   */
  async post(
    id: string,
    actorUserId: string,
    actorRole: Role,
    idempotencyKey?: string,
  ): Promise<GoodsReceiptWithLines> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM goods_receipts WHERE id = ${id}::uuid FOR UPDATE`;
      const receipt = await tx.goodsReceipt.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!receipt) throw new NotFoundException('Goods receipt not found');

      if (receipt.status === GoodsReceiptStatus.POSTED) {
        return receipt;
      }
      if (receipt.status === GoodsReceiptStatus.REVERSED) {
        throw new ConflictException('Cannot post a reversed goods receipt');
      }

      if (idempotencyKey) {
        const clash = await tx.goodsReceipt.findFirst({
          where: { idempotencyKey, NOT: { id: receipt.id } },
          include: { lines: true },
        });
        if (clash) {
          if (clash.status === GoodsReceiptStatus.POSTED) return clash;
          throw new ConflictException(
            'Idempotency-Key already used by another goods receipt',
          );
        }
      }

      const po = await this.purchaseOrdersService.lockForReceiving(
        tx,
        receipt.purchaseOrderId,
      );

      if (receipt.warehouseId !== po.warehouseId) {
        throw new ConflictException(
          'Goods receipt warehouse does not match the purchase order destination warehouse',
        );
      }

      this.assertExcessAuthorized(receipt.lines, actorRole);

      const poLinesById = new Map(po.lines.map((line) => [line.id, line]));
      const deltas: { purchaseOrderLineId: string; acceptedQuantity: number }[] = [];
      const seenPoLineIds = new Set<string>();

      for (const line of receipt.lines) {
        if (
          line.deliveredQuantity !==
          line.acceptedQuantity + line.rejectedQuantity + line.damagedQuantity
        ) {
          throw new BadRequestException(
            'delivered quantity must equal accepted + rejected + damaged',
          );
        }

        const poLine = poLinesById.get(line.purchaseOrderLineId);
        if (!poLine) {
          throw new NotFoundException(
            'Purchase order line not found for this receipt line',
          );
        }
        // Defense in depth alongside the DB's
        // @@unique([goodsReceiptId, purchaseOrderLineId]) — two lines for the
        // same PO line would each pass the outstanding-quantity check below
        // independently while together over-receiving it.
        if (seenPoLineIds.has(poLine.id)) {
          throw new ConflictException(
            `Purchase order line ${poLine.id} appears more than once on this receipt`,
          );
        }
        seenPoLineIds.add(poLine.id);

        const outstanding =
          poLine.orderedQuantity - poLine.receivedQuantity - poLine.cancelledQuantity;
        const excess = line.acceptedQuantity - outstanding;
        if (excess > 0 && excess > line.authorizedExcessQty) {
          throw new ConflictException(
            `Accepted quantity for line ${poLine.id} exceeds the outstanding quantity without authorization`,
          );
        }
        this.assertDiscrepancyExplained(line, excess);

        if (line.acceptedQuantity > 0) {
          // acceptedQuantity is in purchasing units; packSize converts it to
          // the inventory unit (e.g. 3 cases of 12 -> 36 each).
          const { movement } = await this.inventoryService.receiveStockForReference(
            tx,
            receipt.warehouseId,
            poLine.variantId,
            line.acceptedQuantity * poLine.packSize,
            { referenceType: 'goods_receipt_line', referenceId: line.id },
            receipt.supplierDeliveryNoteRef ?? undefined,
          );
          await tx.goodsReceiptLine.update({
            where: { id: line.id },
            data: { inventoryMovementId: movement.id },
          });
        }

        deltas.push({
          purchaseOrderLineId: poLine.id,
          acceptedQuantity: line.acceptedQuantity,
        });
      }

      const newPoStatus = await this.purchaseOrdersService.applyReceivedQuantities(
        tx,
        po,
        deltas,
      );

      let posted;
      try {
        posted = await tx.goodsReceipt.update({
          where: { id: receipt.id },
          data: {
            status: GoodsReceiptStatus.POSTED,
            postedByUserId: actorUserId,
            postedAt: new Date(),
            idempotencyKey: idempotencyKey ?? receipt.idempotencyKey,
          },
          include: { lines: true },
        });
      } catch (error) {
        throw this.mapWriteError(error);
      }

      await this.auditService.record(
        {
          actorUserId,
          action: 'procurement.goods_receipt.posted',
          targetType: 'GoodsReceipt',
          targetId: posted.id,
          metadata: {
            purchaseOrderId: po.id,
            poNumber: po.poNumber,
            newPurchaseOrderStatus: newPoStatus,
          },
        },
        tx,
      );

      await this.outboxService.record(
        {
          topic: 'procurement.receipt.posted',
          aggregateType: 'GoodsReceipt',
          aggregateId: posted.id,
          payload: { purchaseOrderId: po.id, receiptNumber: posted.receiptNumber },
        },
        tx,
      );

      const hasDiscrepancy = receipt.lines.some(
        (line) =>
          line.rejectedQuantity > 0 ||
          line.damagedQuantity > 0 ||
          line.acceptedQuantity !== line.deliveredQuantity,
      );
      if (hasDiscrepancy) {
        await this.outboxService.record(
          {
            topic: 'procurement.receipt.discrepancy_detected',
            aggregateType: 'GoodsReceipt',
            aggregateId: posted.id,
            payload: { purchaseOrderId: po.id },
          },
          tx,
        );
      }

      if (newPoStatus === PurchaseOrderStatus.RECEIVED) {
        await this.outboxService.record(
          {
            topic: 'procurement.po.completed',
            aggregateType: 'PurchaseOrder',
            aggregateId: po.id,
            payload: { poNumber: po.poNumber },
          },
          tx,
        );
      }

      return posted;
    });
  }

  /** ADMIN-only, enforced at the controller. */
  async reverse(
    id: string,
    reason: string,
    actorUserId: string,
  ): Promise<GoodsReceiptWithLines> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM goods_receipts WHERE id = ${id}::uuid FOR UPDATE`;
      const receipt = await tx.goodsReceipt.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!receipt) throw new NotFoundException('Goods receipt not found');
      if (receipt.status !== GoodsReceiptStatus.POSTED) {
        throw new ConflictException(
          'Only a posted goods receipt can be reversed',
        );
      }

      const existingReversal = await tx.goodsReceipt.findFirst({
        where: { reversalOfId: receipt.id },
        include: { lines: true },
      });
      if (existingReversal) return existingReversal;

      const po: PurchaseOrderWithLines = await this.purchaseOrdersService.lockRow(
        tx,
        receipt.purchaseOrderId,
      );
      const poLinesById = new Map(po.lines.map((line) => [line.id, line]));
      const receiptNumber = await this.numberingService.nextGoodsReceiptNumber(tx);

      const reversal = await tx.goodsReceipt.create({
        data: {
          receiptNumber,
          purchaseOrderId: receipt.purchaseOrderId,
          warehouseId: receipt.warehouseId,
          status: GoodsReceiptStatus.POSTED,
          receivedByUserId: actorUserId,
          postedByUserId: actorUserId,
          postedAt: new Date(),
          reversalOfId: receipt.id,
          reversalReason: reason,
        },
      });

      const deltas: { purchaseOrderLineId: string; acceptedQuantity: number }[] = [];

      for (const line of receipt.lines) {
        if (line.acceptedQuantity <= 0) continue;
        const poLine = poLinesById.get(line.purchaseOrderLineId);
        if (!poLine) continue;

        const reversalLine = await tx.goodsReceiptLine.create({
          data: {
            goodsReceiptId: reversal.id,
            purchaseOrderLineId: line.purchaseOrderLineId,
            deliveredQuantity: line.acceptedQuantity,
            acceptedQuantity: line.acceptedQuantity,
            discrepancyReason: `Reversal of ${receipt.receiptNumber}: ${reason}`,
          },
        });

        const { movement } = await this.inventoryService.reverseReceiptStock(
          tx,
          receipt.warehouseId,
          poLine.variantId,
          line.acceptedQuantity * poLine.packSize,
          {
            referenceType: 'goods_receipt_reversal_line',
            referenceId: reversalLine.id,
          },
          `Reversal of ${receipt.receiptNumber}`,
        );

        await tx.goodsReceiptLine.update({
          where: { id: reversalLine.id },
          data: { inventoryMovementId: movement.id },
        });

        deltas.push({
          purchaseOrderLineId: poLine.id,
          acceptedQuantity: line.acceptedQuantity,
        });
      }

      await this.purchaseOrdersService.reverseReceivedQuantities(
        tx,
        po.id,
        deltas,
      );

      await tx.goodsReceipt.update({
        where: { id: receipt.id },
        data: {
          status: GoodsReceiptStatus.REVERSED,
          reversedByUserId: actorUserId,
        },
      });

      await this.auditService.record(
        {
          actorUserId,
          action: 'procurement.goods_receipt.reversed',
          targetType: 'GoodsReceipt',
          targetId: receipt.id,
          metadata: { reason, reversalReceiptId: reversal.id },
        },
        tx,
      );

      await this.outboxService.record(
        {
          topic: 'procurement.receipt.reversed',
          aggregateType: 'GoodsReceipt',
          aggregateId: receipt.id,
          payload: { reversalReceiptId: reversal.id, purchaseOrderId: po.id },
        },
        tx,
      );

      return tx.goodsReceipt.findUniqueOrThrow({
        where: { id: reversal.id },
        include: { lines: true },
      });
    });
  }

  private assertReconciled(lines: GoodsReceiptLineDto[]): void {
    for (const line of lines) {
      const delivered =
        line.acceptedQuantity + (line.rejectedQuantity ?? 0) + (line.damagedQuantity ?? 0);
      if (delivered !== line.deliveredQuantity) {
        throw new BadRequestException(
          'delivered quantity must equal accepted + rejected + damaged',
        );
      }
    }
  }

  /** Rejected, damaged, or unauthorized-excess quantities must carry a
   * `discrepancyReason` — otherwise the discrepancy history required for
   * receiving audits goes unexplained. */
  private assertDiscrepancyExplained(
    line: {
      rejectedQuantity?: number;
      damagedQuantity?: number;
      discrepancyReason?: string | null;
    },
    excess: number,
  ): void {
    const hasDiscrepancy =
      (line.rejectedQuantity ?? 0) > 0 ||
      (line.damagedQuantity ?? 0) > 0 ||
      excess > 0;
    if (hasDiscrepancy && !line.discrepancyReason?.trim()) {
      throw new BadRequestException(
        'discrepancyReason is required when a line has a rejected, damaged, or excess quantity',
      );
    }
  }

  private assertExcessAuthorized(
    lines: { authorizedExcessQty?: number }[],
    actorRole: Role,
  ): void {
    if (actorRole === Role.ADMIN) return;
    if (lines.some((line) => (line.authorizedExcessQty ?? 0) > 0)) {
      throw new ForbiddenException(
        'Only an administrator may authorize an over-receipt',
      );
    }
  }

  private async assertNoDuplicateDeliveryNote(
    supplierId: string,
    supplierDeliveryNoteRef: string,
  ): Promise<void> {
    const duplicate = await this.prisma.goodsReceipt.findFirst({
      where: {
        supplierDeliveryNoteRef,
        status: { not: GoodsReceiptStatus.REVERSED },
        purchaseOrder: { supplierId },
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'A goods receipt with this supplier delivery note reference already exists',
      );
    }
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
