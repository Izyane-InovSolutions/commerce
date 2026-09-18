import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  Prisma,
  PaymentStatus,
  RefundCaseSource,
  RefundCaseStatus,
  ReturnDisposition,
  ReturnStatus,
  Role,
  type RefundCase,
} from '@prisma/client';

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from '../../common/pagination/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { NumberingService } from '../../common/numbering/numbering.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  RefundCasesService,
  type CreateRefundCaseItemInput,
} from '../payments/refund-cases.service';
import { ApproveReturnDto } from './dto/approve-return.dto';
import { CreateReturnItemDto } from './dto/create-return-item.dto';
import { InspectionLineDto } from './dto/inspection-line.dto';
import { ListReturnsDto } from './dto/list-returns.dto';
import { PostInspectionDto } from './dto/post-inspection.dto';
import { PostReceiptDto } from './dto/post-receipt.dto';
import { RejectReturnDto } from './dto/reject-return.dto';
import { ShippingRefundDto } from './dto/shipping-refund.dto';
import {
  DeliveredChunk,
  allocateGreedy,
  computeItemEligibility,
} from './return-eligibility';
import {
  ItemEligibilityView,
  RETURN_REQUEST_INCLUDE,
  ReturnPage,
  ReturnRequestWithDetail,
} from './returns.types';

/** A confirmed payment is required before any return can be requested. */
const CONFIRMED_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.SUCCEEDED,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
];

const ACTIVE_ALLOCATION_STATUSES: ReturnStatus[] = Object.values(
  ReturnStatus,
).filter(
  (status) =>
    status !== ReturnStatus.REJECTED && status !== ReturnStatus.CANCELLED,
);

type PreparedReturnItem = {
  dto: CreateReturnItemDto;
  unitAmount: number;
  currency: string;
  windowDays: number;
  deliveredAt: Date;
  eligibleUntil: Date;
  allocations: { shipmentLineId: string; quantity: number }[];
};

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly numberingService: NumberingService,
    private readonly refundCasesService: RefundCasesService,
  ) {}

  // ---------------------------------------------------------------------
  // Eligibility
  // ---------------------------------------------------------------------

  async getEligibility(
    userId: string,
    orderId: string,
  ): Promise<ItemEligibilityView[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    return this.computeEligibilityForOrder(orderId);
  }

  private async computeEligibilityForOrder(
    orderId: string,
  ): Promise<ItemEligibilityView[]> {
    const orderItems = await this.prisma.orderItem.findMany({
      where: { orderId },
      include: {
        offer: { include: { variant: { include: { product: true } } } },
      },
    });
    const chunksByItem = await this.loadDeliveredChunks(
      this.prisma,
      orderItems.map((item) => item.id),
    );

    return orderItems.map((item) => {
      const product = item.offer.variant.product;
      const chunks = chunksByItem.get(item.id) ?? [];
      const eligibility = computeItemEligibility(
        product.isReturnable,
        product.returnWindowDays,
        chunks,
      );
      return {
        orderItemId: item.id,
        returnable: eligibility.eligible,
        reason: eligibility.reason,
        returnWindowDays: eligibility.windowDays,
        totalRemainingQuantity: eligibility.totalRemainingQuantity,
        chunks: eligibility.chunks.map((c) => ({
          shipmentLineId: c.shipmentLineId,
          deliveredAt: c.deliveredAt,
          eligibleUntil: c.eligibleUntil,
          remainingQuantity: c.expired ? 0 : c.remainingQuantity,
        })),
      };
    });
  }

  private async loadDeliveredChunks(
    client: Pick<Prisma.TransactionClient, 'shipmentLine'>,
    orderItemIds: string[],
  ): Promise<Map<string, DeliveredChunk[]>> {
    if (orderItemIds.length === 0) return new Map();
    const shipmentLines = await client.shipmentLine.findMany({
      where: {
        orderItemId: { in: orderItemIds },
        shipment: { status: 'DELIVERED' },
      },
      include: {
        shipment: true,
        returnAllocations: {
          include: { returnItem: { include: { returnRequest: true } } },
        },
      },
    });

    const map = new Map<string, DeliveredChunk[]>();
    for (const line of shipmentLines) {
      if (!line.shipment.deliveredAt) continue;
      const claimed = line.returnAllocations
        .filter((allocation) =>
          ACTIVE_ALLOCATION_STATUSES.includes(
            allocation.returnItem.returnRequest.status,
          ),
        )
        .reduce(
          (sum, allocation) =>
            sum + allocation.quantity - allocation.releasedQuantity,
          0,
        );
      const list = map.get(line.orderItemId) ?? [];
      list.push({
        shipmentLineId: line.id,
        deliveredAt: line.shipment.deliveredAt,
        quantity: line.quantity,
        claimedQuantity: claimed,
      });
      map.set(line.orderItemId, list);
    }
    return map;
  }

  // ---------------------------------------------------------------------
  // Customer / admin creation, read, cancel
  // ---------------------------------------------------------------------

  /**
   * Shared by the customer's own `POST /orders/:orderId/returns` and the
   * admin on-behalf-of-customer path — `userId` is either the caller's own
   * id or the admin-supplied target customer id, and ownership of the order
   * by that user is always re-checked here regardless of caller.
   */
  async requestReturn(
    orderId: string,
    items: CreateReturnItemDto[],
    idempotencyKey: string,
    userId: string,
  ): Promise<ReturnRequestWithDetail> {
    this.assertUniqueIds(
      items.map((item) => item.orderItemId),
      'order item',
    );
    const requestHash = this.hashRequest({
      orderId,
      userId,
      items: [...items].sort((a, b) =>
        a.orderItemId.localeCompare(b.orderItemId),
      ),
    });
    const existing = await this.prisma.returnRequest.findUnique({
      where: { idempotencyKey },
      include: RETURN_REQUEST_INCLUDE,
    });
    if (existing) {
      if (
        existing.orderId !== orderId ||
        existing.userId !== userId ||
        existing.requestHash !== requestHash
      ) {
        throw new ConflictException(
          'Idempotency-Key already used for a different request',
        );
      }
      return existing;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    if (
      !order.payment ||
      !CONFIRMED_PAYMENT_STATUSES.includes(order.payment.status)
    ) {
      throw new ConflictException(
        'Order payment must be confirmed before a return can be requested',
      );
    }

    const orderItemIds = items.map((item) => item.orderItemId);
    const orderItems = await this.prisma.orderItem.findMany({
      where: { id: { in: orderItemIds }, orderId },
      include: {
        offer: { include: { variant: { include: { product: true } } } },
      },
    });
    const orderItemsById = new Map(orderItems.map((item) => [item.id, item]));
    for (const dto of items) {
      if (!orderItemsById.has(dto.orderItemId)) {
        throw new BadRequestException(
          `Order item ${dto.orderItemId} does not belong to this order`,
        );
      }
    }

    // Pre-fetch the candidate shipment line ids outside the transaction so
    // we know what to FOR-UPDATE lock once inside it; the actual quantities
    // are re-read fresh under that lock, right before allocating.
    const candidateLines = await this.prisma.shipmentLine.findMany({
      where: {
        orderItemId: { in: orderItemIds },
        shipment: { status: 'DELIVERED' },
      },
      select: { id: true },
    });
    const candidateLineIds = candidateLines.map((line) => line.id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (candidateLineIds.length > 0) {
          await tx.$queryRaw`SELECT id FROM shipment_lines WHERE id = ANY(${candidateLineIds}::uuid[]) FOR UPDATE`;
        }
        const chunksByItem = await this.loadDeliveredChunks(tx, orderItemIds);
        const now = new Date();
        const prepared: PreparedReturnItem[] = [];

        for (const dto of items) {
          const orderItem = orderItemsById.get(dto.orderItemId)!;
          const product = orderItem.offer.variant.product;
          const chunks = chunksByItem.get(dto.orderItemId) ?? [];
          const eligibility = computeItemEligibility(
            product.isReturnable,
            product.returnWindowDays,
            chunks,
            now,
          );
          if (!eligibility.eligible) {
            throw new ConflictException(
              `Order item ${dto.orderItemId} is not eligible for return: ${eligibility.reason}`,
            );
          }
          const allocations = allocateGreedy(
            eligibility.chunks,
            dto.quantity,
            now,
          );
          if (!allocations) {
            throw new ConflictException(
              `Order item ${dto.orderItemId} does not have enough returnable quantity available`,
            );
          }
          const primary = eligibility.chunks.find(
            (c) => c.shipmentLineId === allocations[0]?.shipmentLineId,
          )!;
          prepared.push({
            dto,
            unitAmount: orderItem.unitAmount,
            currency: orderItem.currency,
            windowDays: eligibility.windowDays,
            deliveredAt: primary.deliveredAt,
            eligibleUntil: primary.eligibleUntil,
            allocations,
          });
        }

        const created = await tx.returnRequest.create({
          data: { orderId, userId, idempotencyKey, requestHash },
        });

        for (const entry of prepared) {
          const returnItem = await tx.returnItem.create({
            data: {
              returnRequestId: created.id,
              orderItemId: entry.dto.orderItemId,
              quantity: entry.dto.quantity,
              reasonCode: entry.dto.reasonCode,
              note: entry.dto.note,
              unitAmount: entry.unitAmount,
              currency: entry.currency,
              returnWindowDays: entry.windowDays,
              eligibleUntil: entry.eligibleUntil,
              deliveredAt: entry.deliveredAt,
            },
          });
          for (const allocation of entry.allocations) {
            await tx.returnItemAllocation.create({
              data: {
                returnItemId: returnItem.id,
                shipmentLineId: allocation.shipmentLineId,
                quantity: allocation.quantity,
              },
            });
          }
        }

        await tx.returnEvent.create({
          data: {
            returnRequestId: created.id,
            type: 'STATUS_CHANGED',
            actorUserId: userId,
            data: { to: ReturnStatus.REQUESTED },
          },
        });

        return tx.returnRequest.findUniqueOrThrow({
          where: { id: created.id },
          include: RETURN_REQUEST_INCLUDE,
        });
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async listOwn(userId: string): Promise<ReturnRequestWithDetail[]> {
    return this.prisma.returnRequest.findMany({
      where: { userId },
      include: RETURN_REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOwn(userId: string, id: string): Promise<ReturnRequestWithDetail> {
    const returnRequest = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: RETURN_REQUEST_INCLUDE,
    });
    if (!returnRequest || returnRequest.userId !== userId) {
      throw new NotFoundException('Return request not found');
    }
    return returnRequest;
  }

  async cancelReturn(
    userId: string,
    id: string,
    version: number,
  ): Promise<ReturnRequestWithDetail> {
    await this.findOwn(userId, id);
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.returnRequest.updateMany({
        where: { id, userId, status: ReturnStatus.REQUESTED, version },
        data: { status: ReturnStatus.CANCELLED, version: { increment: 1 } },
      });
      if (result.count !== 1) {
        throw new ConflictException(
          'Return request changed; reload and try again',
        );
      }
      await tx.returnEvent.create({
        data: {
          returnRequestId: id,
          type: 'STATUS_CHANGED',
          actorUserId: userId,
          data: { from: ReturnStatus.REQUESTED, to: ReturnStatus.CANCELLED },
        },
      });
      return tx.returnRequest.findUniqueOrThrow({
        where: { id },
        include: RETURN_REQUEST_INCLUDE,
      });
    });
  }

  // ---------------------------------------------------------------------
  // Admin / staff reads
  // ---------------------------------------------------------------------

  async findAny(id: string): Promise<ReturnRequestWithDetail> {
    const returnRequest = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: RETURN_REQUEST_INCLUDE,
    });
    if (!returnRequest) throw new NotFoundException('Return request not found');
    return returnRequest;
  }

  async listAll(query: ListReturnsDto): Promise<ReturnPage> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.ReturnRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.assignedStaffId
        ? { assignedStaffId: query.assignedStaffId }
        : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.returnRequest.findMany({
        where,
        include: RETURN_REQUEST_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.returnRequest.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  // ---------------------------------------------------------------------
  // Admin: approve / reject
  // ---------------------------------------------------------------------

  async approve(
    id: string,
    dto: ApproveReturnDto,
    actorUserId: string,
  ): Promise<ReturnRequestWithDetail> {
    const existing = await this.findAny(id);
    if (existing.status !== ReturnStatus.REQUESTED) {
      throw new ConflictException(
        `Cannot approve a return with status ${existing.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const rmaNumber = await this.numberingService.nextReturnRmaNumber(tx);
      const rmaInstructions = `Ship the item(s) back referencing RMA ${rmaNumber}; the warehouse will confirm receipt once scanned in.`;
      const result = await tx.returnRequest.updateMany({
        where: { id, version: dto.version, status: ReturnStatus.REQUESTED },
        data: {
          status: ReturnStatus.APPROVED,
          warehouseId: dto.warehouseId,
          assignedStaffId: dto.assignedStaffId,
          rmaNumber,
          rmaInstructions,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException(
          'Return request changed; reload and try again',
        );
      }
      await tx.returnEvent.create({
        data: {
          returnRequestId: id,
          type: 'STATUS_CHANGED',
          actorUserId,
          data: { to: ReturnStatus.APPROVED, rmaNumber },
        },
      });
      return tx.returnRequest.findUniqueOrThrow({
        where: { id },
        include: RETURN_REQUEST_INCLUDE,
      });
    });
  }

  async reject(
    id: string,
    dto: RejectReturnDto,
    actorUserId: string,
  ): Promise<ReturnRequestWithDetail> {
    const existing = await this.findAny(id);
    if (existing.status !== ReturnStatus.REQUESTED) {
      throw new ConflictException(
        `Cannot reject a return with status ${existing.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.returnRequest.updateMany({
        where: { id, version: dto.version, status: ReturnStatus.REQUESTED },
        data: {
          status: ReturnStatus.REJECTED,
          rejectionReason: dto.rejectionReason,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException(
          'Return request changed; reload and try again',
        );
      }
      await tx.returnEvent.create({
        data: {
          returnRequestId: id,
          type: 'STATUS_CHANGED',
          actorUserId,
          data: { to: ReturnStatus.REJECTED, reason: dto.rejectionReason },
        },
      });
      return tx.returnRequest.findUniqueOrThrow({
        where: { id },
        include: RETURN_REQUEST_INCLUDE,
      });
    });
  }

  // ---------------------------------------------------------------------
  // Staff/admin: receipts
  // ---------------------------------------------------------------------

  async postReceipt(
    id: string,
    dto: PostReceiptDto,
    actorUserId: string,
    actorRole: Role,
    idempotencyKey: string,
  ): Promise<ReturnRequestWithDetail> {
    this.assertUniqueIds(
      dto.lines.map((line) => line.returnItemId),
      'return item',
    );
    const requestHash = this.hashRequest({
      returnRequestId: id,
      warehouseId: dto.warehouseId,
      isClosing: dto.isClosing ?? false,
      lines: [...dto.lines].sort((a, b) =>
        a.returnItemId.localeCompare(b.returnItemId),
      ),
    });
    const existingReceipt = await this.prisma.returnReceipt.findUnique({
      where: { idempotencyKey },
    });
    if (existingReceipt) {
      if (
        existingReceipt.returnRequestId !== id ||
        existingReceipt.requestHash !== requestHash
      ) {
        throw new ConflictException(
          'Idempotency-Key already used for a different request',
        );
      }
      return this.findAny(id);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM return_requests WHERE id = ${id}::uuid FOR UPDATE`;
        const returnRequest = await tx.returnRequest.findUnique({
          where: { id },
          include: { items: { include: { allocations: true } } },
        });
        if (!returnRequest)
          throw new NotFoundException('Return request not found');
        this.assertStaffAssignment(returnRequest, actorUserId, actorRole);
        if (
          returnRequest.status !== ReturnStatus.APPROVED &&
          returnRequest.status !== ReturnStatus.RECEIVING
        ) {
          throw new ConflictException(
            `Cannot post a receipt against a return with status ${returnRequest.status}`,
          );
        }
        if (returnRequest.warehouseId !== dto.warehouseId) {
          throw new ConflictException(
            'Receipt warehouse does not match the return request warehouse',
          );
        }

        const itemsById = new Map(
          returnRequest.items.map((item) => [item.id, item]),
        );
        const receivedByItem = await this.sumReceivedByItem(tx, id);
        for (const line of dto.lines) {
          const item = itemsById.get(line.returnItemId);
          if (!item) {
            throw new BadRequestException(
              `Return item ${line.returnItemId} does not belong to this return request`,
            );
          }
          if (
            (receivedByItem.get(item.id) ?? 0) + line.quantity >
            item.quantity
          )
            throw new ConflictException(
              `Receipt quantity for return item ${item.id} exceeds its requested quantity`,
            );
        }

        const receipt = await tx.returnReceipt.create({
          data: {
            returnRequestId: id,
            warehouseId: dto.warehouseId,
            postedByUserId: actorUserId,
            isClosing: dto.isClosing ?? false,
            idempotencyKey,
            requestHash,
            lines: {
              create: dto.lines.map((line) => ({
                returnItemId: line.returnItemId,
                quantity: line.quantity,
              })),
            },
          },
        });

        await tx.returnEvent.create({
          data: {
            returnRequestId: id,
            type: 'RECEIPT_POSTED',
            actorUserId,
            data: {
              receiptId: receipt.id,
              lines: dto.lines,
              isClosing: dto.isClosing ?? false,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        if (dto.isClosing) {
          const totalsAfterReceipt = await this.sumReceivedByItem(tx, id);
          for (const item of returnRequest.items) {
            const unreceived =
              item.quantity - (totalsAfterReceipt.get(item.id) ?? 0);
            if (unreceived > 0) {
              let remaining = unreceived;
              for (const allocation of [...item.allocations].reverse()) {
                if (remaining === 0) break;
                const releasable =
                  allocation.quantity - allocation.releasedQuantity;
                const released = Math.min(releasable, remaining);
                if (released > 0)
                  await tx.returnItemAllocation.update({
                    where: { id: allocation.id },
                    data: { releasedQuantity: { increment: released } },
                  });
                remaining -= released;
              }
              await tx.returnEvent.create({
                data: {
                  returnRequestId: id,
                  type: 'CLOSING_RECEIPT_RELEASED_QUANTITY',
                  actorUserId,
                  data: { returnItemId: item.id, releasedQuantity: unreceived },
                },
              });
            }
          }
          await tx.returnRequest.update({
            where: { id },
            data: { status: ReturnStatus.RECEIVED, version: { increment: 1 } },
          });
          await tx.returnEvent.create({
            data: {
              returnRequestId: id,
              type: 'STATUS_CHANGED',
              actorUserId,
              data: { to: ReturnStatus.RECEIVED },
            },
          });
        } else if (returnRequest.status === ReturnStatus.APPROVED) {
          await tx.returnRequest.update({
            where: { id },
            data: { status: ReturnStatus.RECEIVING, version: { increment: 1 } },
          });
          await tx.returnEvent.create({
            data: {
              returnRequestId: id,
              type: 'STATUS_CHANGED',
              actorUserId,
              data: { to: ReturnStatus.RECEIVING },
            },
          });
        }

        return tx.returnRequest.findUniqueOrThrow({
          where: { id },
          include: RETURN_REQUEST_INCLUDE,
        });
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  // ---------------------------------------------------------------------
  // Staff/admin: inspections
  // ---------------------------------------------------------------------

  async postInspection(
    id: string,
    dto: PostInspectionDto,
    actorUserId: string,
    actorRole: Role,
    idempotencyKey: string,
  ): Promise<ReturnRequestWithDetail> {
    this.assertUniqueIds(
      dto.lines.map((line) => line.returnItemId),
      'return item',
    );
    this.assertUniqueIds(
      (dto.shippingRefunds ?? []).map((line) => line.sellerOrderId),
      'seller order shipping refund',
    );
    const requestHash = this.hashRequest({
      returnRequestId: id,
      isFinal: dto.isFinal ?? false,
      lines: [...dto.lines].sort((a, b) =>
        a.returnItemId.localeCompare(b.returnItemId),
      ),
      shippingRefunds: [...(dto.shippingRefunds ?? [])].sort((a, b) =>
        a.sellerOrderId.localeCompare(b.sellerOrderId),
      ),
    });
    const existingInspection = await this.prisma.returnInspection.findUnique({
      where: { idempotencyKey },
    });
    if (existingInspection) {
      if (
        existingInspection.returnRequestId !== id ||
        existingInspection.requestHash !== requestHash
      ) {
        throw new ConflictException(
          'Idempotency-Key already used for a different request',
        );
      }
      if (dto.isFinal) await this.processPendingReturnRefunds(id);
      return this.findAny(id);
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM return_requests WHERE id = ${id}::uuid FOR UPDATE`;
        const returnRequest = await tx.returnRequest.findUnique({
          where: { id },
          include: {
            items: { include: { orderItem: { include: { offer: true } } } },
          },
        });
        if (!returnRequest)
          throw new NotFoundException('Return request not found');
        this.assertStaffAssignment(returnRequest, actorUserId, actorRole);
        if (
          returnRequest.status !== ReturnStatus.RECEIVED &&
          returnRequest.status !== ReturnStatus.INSPECTING
        ) {
          throw new ConflictException(
            `Cannot post an inspection against a return with status ${returnRequest.status}`,
          );
        }

        const itemsById = new Map(
          returnRequest.items.map((item) => [item.id, item]),
        );
        const receivedByItem = await this.sumReceivedByItem(tx, id);
        const handledByItem = await this.sumInspectedByItem(tx, id);

        this.validateInspectionLines(
          dto.lines,
          itemsById,
          returnRequest.warehouseId,
          receivedByItem,
          handledByItem,
        );

        const inspection = await tx.returnInspection.create({
          data: {
            returnRequestId: id,
            inspectedByUserId: actorUserId,
            isFinal: dto.isFinal ?? false,
            idempotencyKey,
            requestHash,
            lines: {
              create: dto.lines.map((line) => ({
                returnItemId: line.returnItemId,
                warehouseId: line.warehouseId,
                acceptedQuantity: line.acceptedQuantity,
                disposition: line.disposition,
                rejectedQuantity: line.rejectedQuantity,
                rejectionReason: line.rejectionReason,
              })),
            },
          },
          include: { lines: true },
        });

        if (returnRequest.status === ReturnStatus.RECEIVED) {
          await tx.returnRequest.update({
            where: { id },
            data: {
              status: ReturnStatus.INSPECTING,
              version: { increment: 1 },
            },
          });
          await tx.returnEvent.create({
            data: {
              returnRequestId: id,
              type: 'STATUS_CHANGED',
              actorUserId,
              data: { to: ReturnStatus.INSPECTING },
            },
          });
        }

        await tx.returnEvent.create({
          data: {
            returnRequestId: id,
            type: 'INSPECTION_POSTED',
            actorUserId,
            data: {
              inspectionId: inspection.id,
              lines: dto.lines,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        for (const line of inspection.lines) {
          if (
            line.disposition === ReturnDisposition.RESTOCK &&
            line.acceptedQuantity > 0
          ) {
            const item = itemsById.get(line.returnItemId)!;
            const variantId = item.orderItem.offer.variantId;
            await this.inventoryService.receiveReturnedStock(
              tx,
              line.warehouseId,
              variantId,
              line.acceptedQuantity,
              { referenceType: 'return_inspection_line', referenceId: line.id },
            );
          }
        }

        if (dto.isFinal) {
          await this.finalizeInternal(
            tx,
            id,
            actorUserId,
            dto.shippingRefunds ?? [],
          );
        }

        return tx.returnRequest.findUniqueOrThrow({
          where: { id },
          include: RETURN_REQUEST_INCLUDE,
        });
      });
      if (dto.isFinal) {
        const processed = await this.processPendingReturnRefunds(id);
        return processed ? this.findAny(id) : result;
      }
      return result;
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  /**
   * Documented as the alternative to `isFinal` on `postInspection`: use this
   * when the final inspection lines were already posted (isFinal: false) and
   * finalization needs to happen as its own step. Idempotent — a return no
   * longer INSPECTING is returned unchanged rather than re-finalized.
   */
  async finalizeInspection(
    id: string,
    actorUserId: string,
    shippingRefunds: ShippingRefundDto[] = [],
  ): Promise<ReturnRequestWithDetail> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM return_requests WHERE id = ${id}::uuid FOR UPDATE`;
      const returnRequest = await tx.returnRequest.findUnique({
        where: { id },
      });
      if (!returnRequest)
        throw new NotFoundException('Return request not found');
      if (returnRequest.status === ReturnStatus.INSPECTING) {
        await this.finalizeInternal(tx, id, actorUserId, shippingRefunds);
      }
      return tx.returnRequest.findUniqueOrThrow({
        where: { id },
        include: RETURN_REQUEST_INCLUDE,
      });
    });
    const processed = await this.processPendingReturnRefunds(id);
    return processed ? this.findAny(id) : result;
  }

  async retryRefundCase(id: string, refundCaseId: string): Promise<RefundCase> {
    const returnRequest = await this.findAny(id);
    const belongs = returnRequest.refundCases.some(
      (c) => c.id === refundCaseId,
    );
    if (!belongs) {
      throw new NotFoundException(
        'Refund case not found for this return request',
      );
    }
    return this.refundCasesService.retry(refundCaseId);
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private validateInspectionLines(
    lines: InspectionLineDto[],
    itemsById: Map<string, { id: string }>,
    returnWarehouseId: string | null,
    receivedByItem: Map<string, number>,
    handledByItem: Map<string, number>,
  ): void {
    // handledByItem is mutated as we go so multiple lines in this same call
    // referencing the same return item stack their quantities correctly.
    for (const line of lines) {
      const item = itemsById.get(line.returnItemId);
      if (!item) {
        throw new BadRequestException(
          `Return item ${line.returnItemId} does not belong to this return request`,
        );
      }
      if (returnWarehouseId && line.warehouseId !== returnWarehouseId) {
        throw new BadRequestException(
          'Inspection warehouse must match the return request warehouse',
        );
      }
      if (line.acceptedQuantity > 0 && !line.disposition) {
        throw new BadRequestException(
          'disposition is required when acceptedQuantity > 0',
        );
      }
      if (line.rejectedQuantity > 0 && !line.rejectionReason?.trim()) {
        throw new BadRequestException(
          'rejectionReason is required when rejectedQuantity > 0',
        );
      }
      const received = receivedByItem.get(item.id) ?? 0;
      const priorHandled = handledByItem.get(item.id) ?? 0;
      const thisHandled = line.acceptedQuantity + line.rejectedQuantity;
      if (thisHandled === 0)
        throw new BadRequestException(
          'An inspection line must accept or reject at least one unit',
        );
      if (priorHandled + thisHandled > received) {
        throw new ConflictException(
          `Inspection quantity for return item ${item.id} exceeds its received quantity`,
        );
      }
      handledByItem.set(item.id, priorHandled + thisHandled);
    }
  }

  /**
   * Completeness gate + refund-case fan-out. Called either inline from
   * `postInspection` (isFinal: true) or from the standalone
   * `finalizeInspection` endpoint. Runs inside the caller's transaction so
   * the completeness check and the status/refund-case write are atomic.
   */
  private async finalizeInternal(
    tx: Prisma.TransactionClient,
    id: string,
    actorUserId: string,
    shippingRefunds: ShippingRefundDto[],
  ): Promise<void> {
    const returnRequest = await tx.returnRequest.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { orderItem: true } } },
    });

    const receivedByItem = await this.sumReceivedByItem(tx, id);
    const handledByItem = await this.sumInspectedByItem(tx, id);
    const acceptedByItem = await this.sumAcceptedByItem(tx, id);

    for (const item of returnRequest.items) {
      const received = receivedByItem.get(item.id) ?? 0;
      const handled = handledByItem.get(item.id) ?? 0;
      if (handled < received) {
        throw new ConflictException(
          `Return item ${item.id} has received quantity that is not yet dispositioned or rejected`,
        );
      }
    }

    const totalAccepted = [...acceptedByItem.values()].reduce(
      (sum, v) => sum + v,
      0,
    );

    if (totalAccepted === 0) {
      await tx.returnRequest.update({
        where: { id },
        data: {
          status: ReturnStatus.CLOSED_NO_REFUND,
          version: { increment: 1 },
        },
      });
      await tx.returnEvent.create({
        data: {
          returnRequestId: id,
          type: 'STATUS_CHANGED',
          actorUserId,
          data: { to: ReturnStatus.CLOSED_NO_REFUND },
        },
      });
      return;
    }

    const groups = new Map<
      string,
      {
        orderItemId: string;
        returnItemId: string;
        quantity: number;
        amount: number;
        currency: string;
      }[]
    >();
    for (const item of returnRequest.items) {
      const accepted = acceptedByItem.get(item.id) ?? 0;
      if (accepted <= 0) continue;
      const sellerOrderId = item.orderItem.sellerOrderId;
      if (!sellerOrderId) continue;
      const list = groups.get(sellerOrderId) ?? [];
      list.push({
        orderItemId: item.orderItemId,
        returnItemId: item.id,
        quantity: accepted,
        amount: accepted * item.unitAmount,
        currency: item.currency,
      });
      groups.set(sellerOrderId, list);
    }
    for (const shippingRefund of shippingRefunds) {
      if (!groups.has(shippingRefund.sellerOrderId))
        throw new BadRequestException(
          `Shipping refund seller order ${shippingRefund.sellerOrderId} is not part of this accepted return`,
        );
    }

    const createdCases: RefundCase[] = [];
    for (const [sellerOrderId, refundItems] of groups) {
      const itemsAmount = refundItems.reduce((sum, i) => sum + i.amount, 0);
      const shippingAmount =
        shippingRefunds.find((s) => s.sellerOrderId === sellerOrderId)
          ?.amount ?? 0;
      const createInput: CreateRefundCaseItemInput[] = refundItems.map((i) => ({
        orderItemId: i.orderItemId,
        returnItemId: i.returnItemId,
        quantity: i.quantity,
        amount: i.amount,
        currency: i.currency,
      }));
      const prepared = await this.refundCasesService.prepareCase(
        {
          sellerOrderId,
          source: RefundCaseSource.RETURN,
          returnRequestId: id,
          amount: itemsAmount + shippingAmount,
          shippingAmount,
          currency: refundItems[0]!.currency,
          reason: `Return ${returnRequest.rmaNumber ?? returnRequest.id} accepted items`,
          idempotencyKey: `return-finalize:${id}:${sellerOrderId}`,
          items: createInput,
        },
        tx,
      );
      createdCases.push(prepared.refundCase);
    }

    let newStatus: ReturnStatus = ReturnStatus.REFUND_PENDING;
    if (createdCases.length > 0) {
      const allSucceeded = createdCases.every(
        (c) => c.status === RefundCaseStatus.SUCCEEDED,
      );
      const anySucceeded = createdCases.some(
        (c) => c.status === RefundCaseStatus.SUCCEEDED,
      );
      const anyFailed = createdCases.some(
        (c) => c.status === RefundCaseStatus.FAILED,
      );
      if (allSucceeded) newStatus = ReturnStatus.REFUNDED;
      else if (anySucceeded) newStatus = ReturnStatus.PARTIALLY_REFUNDED;
      else if (anyFailed) newStatus = ReturnStatus.REFUND_FAILED;
    }

    await tx.returnRequest.update({
      where: { id },
      data: { status: newStatus, version: { increment: 1 } },
    });
    await tx.returnEvent.create({
      data: {
        returnRequestId: id,
        type: 'STATUS_CHANGED',
        actorUserId,
        data: { to: newStatus, refundCaseIds: createdCases.map((c) => c.id) },
      },
    });
  }

  private async sumReceivedByItem(
    tx: Prisma.TransactionClient,
    returnRequestId: string,
  ): Promise<Map<string, number>> {
    const lines = await tx.returnReceiptLine.findMany({
      where: { receipt: { returnRequestId } },
    });
    const map = new Map<string, number>();
    for (const line of lines) {
      map.set(
        line.returnItemId,
        (map.get(line.returnItemId) ?? 0) + line.quantity,
      );
    }
    return map;
  }

  private async sumInspectedByItem(
    tx: Prisma.TransactionClient,
    returnRequestId: string,
  ): Promise<Map<string, number>> {
    const lines = await tx.returnInspectionLine.findMany({
      where: { inspection: { returnRequestId } },
    });
    const map = new Map<string, number>();
    for (const line of lines) {
      map.set(
        line.returnItemId,
        (map.get(line.returnItemId) ?? 0) +
          line.acceptedQuantity +
          line.rejectedQuantity,
      );
    }
    return map;
  }

  private async sumAcceptedByItem(
    tx: Prisma.TransactionClient,
    returnRequestId: string,
  ): Promise<Map<string, number>> {
    const lines = await tx.returnInspectionLine.findMany({
      where: { inspection: { returnRequestId }, acceptedQuantity: { gt: 0 } },
    });
    const map = new Map<string, number>();
    for (const line of lines) {
      map.set(
        line.returnItemId,
        (map.get(line.returnItemId) ?? 0) + line.acceptedQuantity,
      );
    }
    return map;
  }

  private assertStaffAssignment(
    returnRequest: { assignedStaffId: string | null },
    actorUserId: string,
    actorRole: Role,
  ): void {
    if (actorRole === Role.ADMIN) return;
    if (returnRequest.assignedStaffId !== actorUserId) {
      throw new ForbiddenException(
        'Only the assigned staff member or an administrator may act on this return',
      );
    }
  }

  private async processPendingReturnRefunds(id: string): Promise<boolean> {
    const cases = await this.prisma.refundCase.findMany({
      where: { returnRequestId: id, status: RefundCaseStatus.PENDING },
      orderBy: { id: 'asc' },
    });
    for (const refundCase of cases)
      await this.refundCasesService.processPending(refundCase.id);
    return cases.length > 0;
  }

  private assertUniqueIds(ids: string[], label: string): void {
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException(`Each ${label} may appear only once`);
  }

  private hashRequest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private mapWriteError(error: unknown): unknown {
    if (this.isPrismaError(error, 'P2002')) {
      return new ConflictException(
        'Idempotency-Key already used, or a conflicting allocation was created concurrently',
      );
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
