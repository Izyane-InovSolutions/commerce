import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  OfferStockSource,
  ReservationStatus,
  type InventoryMovement,
  type InventoryRecord,
  type Prisma,
  type Reservation,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { BackgroundJobsService } from '../../infrastructure/jobs/background-jobs.service';
import { AuditService } from '../audit/audit.service';
import { InventoryRecordView, ReserveOptions } from './inventory.types';
import { stockPoolKey, type StockPoolKey } from './stock-allocation';

export type { StockPoolKey } from './stock-allocation';

/**
 * How long a reservation holds stock unless the caller passes its own
 * `ttlSeconds`. Checkout reservations use this, and the unpaid-order reaper
 * is scheduled just after it (see UNPAID_ORDER_EXPIRY_DELAY_MS).
 */
export const DEFAULT_RESERVATION_TTL_SECONDS = 15 * 60;
const POSTGRES_INTEGER_MIN = -2_147_483_648;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

export type AdjustStockOptions = {
  actorUserId: string;
  idempotencyKey?: string;
  ipAddress?: string;
  userAgent?: string;
};

type StoredInventoryAdjustmentResponse = Omit<
  InventoryRecordView,
  'createdAt' | 'updatedAt'
> & {
  createdAt: string;
  updatedAt: string;
};

type InventoryClient = Pick<
  Prisma.TransactionClient,
  'inventoryMovement' | 'inventoryRecord' | 'reservation' | '$executeRaw'
>;

/** What `lockStockPools` needs to know about an offer to find its records. */
export type StockPoolOffer = {
  id: string;
  variantId: string;
  stockSource: OfferStockSource;
};

/** One inventory record by its natural key: a warehouse's or an offer's. */
export type InventoryRecordKey =
  | { warehouseId: string; variantId: string }
  | { offerId: string };

export type LockedRecordKey = Pick<
  InventoryRecord,
  'id' | 'offerId' | 'warehouseId' | 'variantId'
>;

/**
 * Plain code-unit order for lowercase UUID strings, which matches
 * PostgreSQL's own `uuid` ordering — unlike `localeCompare`, whose collation
 * is locale-dependent. Every row-lock loop sorts with this so two
 * transactions always take the same locks in the same order.
 */
function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function sortedUniqueIds(ids: string[]): string[] {
  return [...new Set(ids)].sort(compareIds);
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backgroundJobsService: BackgroundJobsService,
    private readonly auditService: AuditService = new AuditService(prisma),
  ) {}

  async listRecords(
    filter: { warehouseId?: string; variantId?: string } = {},
  ): Promise<InventoryRecordView[]> {
    const records = await this.prisma.inventoryRecord.findMany({
      where: { ...filter, offerId: null },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) => this.toView(record));
  }

  async getAvailableQuantity(variantId: string): Promise<number> {
    const records = await this.prisma.inventoryRecord.findMany({
      where: { variantId, offerId: null },
    });
    return records.reduce(
      (sum, record) => sum + (record.onHand - record.reserved),
      0,
    );
  }

  async updateReorderPoint(
    id: string,
    reorderPoint: number,
  ): Promise<InventoryRecordView> {
    const existing = await this.prisma.inventoryRecord.findUnique({
      where: { id },
    });
    if (!existing || existing.offerId)
      throw new NotFoundException('Inventory record not found');
    const updated = await this.prisma.inventoryRecord.update({
      where: { id },
      data: { reorderPoint },
    });
    return this.toView(updated);
  }

  async getAvailableQuantities(
    variantIds: string[],
  ): Promise<Map<string, number>> {
    const ids = [...new Set(variantIds)];
    if (!ids.length) return new Map();
    const records = await this.prisma.inventoryRecord.findMany({
      where: { variantId: { in: ids }, offerId: null },
      select: { variantId: true, onHand: true, reserved: true },
    });
    const quantities = new Map<string, number>();
    for (const record of records)
      quantities.set(
        record.variantId,
        (quantities.get(record.variantId) ?? 0) +
          record.onHand -
          record.reserved,
      );
    return quantities;
  }

  async getAvailableOfferQuantities(
    offerIds: string[],
  ): Promise<Map<string, number>> {
    const ids = [...new Set(offerIds)];
    if (!ids.length) return new Map();
    const records = await this.prisma.inventoryRecord.findMany({
      where: { offerId: { in: ids } },
      select: { offerId: true, onHand: true, reserved: true },
    });
    return new Map(
      records.flatMap((record) =>
        record.offerId
          ? [[record.offerId, record.onHand - record.reserved] as const]
          : [],
      ),
    );
  }

  /**
   * What checkout would find free on each record of each pool, in ascending
   * record id (the order `reserve` tries them), keyed by `stockPoolKey`.
   *
   * ACTIVE reservations already past `expiresAt` count as free: checkout
   * sweeps them before allocating, so treating them as held would refuse
   * stock a real checkout would get. Read-only and lock-free — a snapshot
   * for an early check, never a substitute for checkout's own locked
   * allocation. A requested pool with no records maps to an empty array.
   */
  async getAllocatableStock(
    pools: StockPoolKey[],
    client: Pick<
      Prisma.TransactionClient,
      'inventoryRecord' | 'reservation'
    > = this.prisma,
  ): Promise<Map<string, number[]>> {
    const allocatable = new Map<string, number[]>(
      pools.map((pool) => [stockPoolKey(pool), []]),
    );
    if (pools.length === 0) return allocatable;

    const records = await client.inventoryRecord.findMany({
      where: {
        OR: pools.map((pool) =>
          pool.kind === 'offer'
            ? { offerId: pool.offerId }
            : { variantId: pool.variantId, offerId: null },
        ),
      },
      select: {
        id: true,
        variantId: true,
        offerId: true,
        onHand: true,
        reserved: true,
      },
      orderBy: { id: 'asc' },
    });
    if (records.length === 0) return allocatable;

    const lapsed = await client.reservation.groupBy({
      by: ['inventoryRecordId'],
      where: {
        inventoryRecordId: { in: records.map((record) => record.id) },
        status: ReservationStatus.ACTIVE,
        expiresAt: { lt: new Date() },
      },
      _sum: { quantity: true },
    });
    const lapsedByRecordId = new Map(
      lapsed.map((row) => [row.inventoryRecordId, row._sum.quantity ?? 0]),
    );

    for (const record of records) {
      const key = record.offerId
        ? stockPoolKey({ kind: 'offer', offerId: record.offerId })
        : stockPoolKey({ kind: 'variant', variantId: record.variantId });
      allocatable
        .get(key)
        ?.push(
          record.onHand -
            record.reserved +
            (lapsedByRecordId.get(record.id) ?? 0),
        );
    }

    return allocatable;
  }

  /**
   * Row-locks the given inventory records, each once, in ascending id — the
   * one order every path that locks several records must use, so two of
   * them can never each hold a record the other is waiting on.
   */
  async lockInventoryRecords(
    ids: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    for (const id of sortedUniqueIds(ids))
      await tx.$queryRaw`SELECT id FROM inventory_records WHERE id = ${id}::uuid FOR UPDATE`;
  }

  /**
   * Takes FOR KEY SHARE on the given offers, in ascending id. Inserting a row
   * that references an offer (an order item, a seller inventory record) takes
   * this lock implicitly through the foreign key; a path that will do so
   * after locking inventory records calls this first instead, so offers are
   * always locked before inventory records — the order a product hard delete
   * (offers FOR UPDATE, then their records) also follows.
   */
  async lockOffersForKeyShare(
    offerIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const ids = sortedUniqueIds(offerIds);
    if (ids.length === 0) return;
    await tx.$queryRaw`SELECT id FROM offers WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR KEY SHARE`;
  }

  /**
   * Locks every record any of these offers could reserve from (see
   * `reserve`/`reserveOffer`) up front, so an order spanning several pools
   * takes all its inventory locks in one global order rather than pool by
   * pool as each line happens to be reserved.
   *
   * Returns the locked ids (ascending): pass them to `reserve`/`reserveOffer`
   * as `lockedRecordIds`, so a record that appears afterwards is never locked
   * behind higher ids this transaction already holds.
   */
  async lockStockPools(
    offers: StockPoolOffer[],
    tx: Prisma.TransactionClient,
  ): Promise<string[]> {
    if (offers.length === 0) return [];
    const records = await tx.inventoryRecord.findMany({
      where: {
        OR: offers.map((offer) =>
          offer.stockSource === OfferStockSource.SELLER
            ? { offerId: offer.id }
            : { variantId: offer.variantId, offerId: null },
        ),
      },
      select: { id: true },
    });
    const ids = sortedUniqueIds(records.map((record) => record.id));
    await this.lockInventoryRecords(ids, tx);
    return ids;
  }

  /**
   * Locks, in ascending id, the existing records a multi-line stock write is
   * about to change — before its first per-line write, so that write never
   * holds one record while waiting on a lower one. A key with no record yet is
   * skipped: the row that write creates is new and uncontended. Returns the
   * locked records' keys in ascending id.
   */
  async lockRecordsForWrite(
    keys: InventoryRecordKey[],
    tx: Prisma.TransactionClient,
  ): Promise<LockedRecordKey[]> {
    if (keys.length === 0) return [];
    const records = await tx.inventoryRecord.findMany({
      where: {
        OR: keys.map((key) =>
          'offerId' in key
            ? { offerId: key.offerId }
            : {
                warehouseId: key.warehouseId,
                variantId: key.variantId,
                offerId: null,
              },
        ),
      },
      select: { id: true, offerId: true, warehouseId: true, variantId: true },
    });
    const sorted = [...records].sort((left, right) =>
      compareIds(left.id, right.id),
    );
    await this.lockInventoryRecords(
      sorted.map((record) => record.id),
      tx,
    );
    return sorted;
  }

  listMovements(inventoryRecordId: string): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { inventoryRecordId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listReservations(inventoryRecordId: string): Promise<Reservation[]> {
    return this.prisma.reservation.findMany({
      where: { inventoryRecordId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrCreateRecord(
    warehouseId: string,
    variantId: string,
  ): Promise<InventoryRecord> {
    return this.getOrCreateRecordWithClient(
      this.prisma,
      warehouseId,
      variantId,
    );
  }

  private async getOrCreateRecordWithClient(
    client: Pick<Prisma.TransactionClient, 'inventoryRecord'>,
    warehouseId: string,
    variantId: string,
  ): Promise<InventoryRecord> {
    const existing = await client.inventoryRecord.findUnique({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });

    if (existing) {
      return existing;
    }

    try {
      return await client.inventoryRecord.create({
        data: { warehouseId, variantId },
      });
    } catch (error) {
      if (!this.isPrismaError(error, 'P2002')) {
        throw error;
      }

      // Lost a create race; the winner's row exists now.
      return client.inventoryRecord.findUniqueOrThrow({
        where: { warehouseId_variantId: { warehouseId, variantId } },
      });
    }
  }

  async receiveStock(
    warehouseId: string,
    variantId: string,
    quantity: number,
    note?: string,
  ): Promise<InventoryRecordView> {
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    const record = await this.getOrCreateRecord(warehouseId, variantId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.inventoryRecord.update({
        where: { id: record.id },
        data: { onHand: { increment: quantity } },
      });
      await this.recordMovement(
        tx,
        record.id,
        InventoryMovementType.RECEIPT,
        quantity,
        note,
      );
      return result;
    });

    return this.toView(updated);
  }

  /**
   * Transaction-scoped receiving for callers (procurement) that must post
   * stock, their own domain rows, and an audit trail atomically. Unlike
   * `receiveStock`, this never opens its own transaction and always tags the
   * movement with the caller's reference, so a posted goods-receipt line can
   * be traced back to the exact movement it created.
   */
  async receiveStockForReference(
    tx: Prisma.TransactionClient,
    warehouseId: string,
    variantId: string,
    quantity: number,
    reference: { referenceType: string; referenceId: string },
    note?: string,
  ): Promise<{ record: InventoryRecord; movement: InventoryMovement }> {
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    const record = await this.getOrCreateRecordWithClient(
      tx,
      warehouseId,
      variantId,
    );
    const updated = await tx.inventoryRecord.update({
      where: { id: record.id },
      data: { onHand: { increment: quantity } },
    });
    const movement = await this.recordMovement(
      tx,
      record.id,
      InventoryMovementType.RECEIPT,
      quantity,
      note,
      reference,
    );

    return { record: updated, movement };
  }

  /**
   * Returns previously-committed stock to on-hand for a cancelled
   * fulfillment quantity. Picking/packing/dispatch never touch inventory —
   * payment already committed and deducted it via `commit()` — so
   * cancelling a fulfillment line is the only fulfillment-side write this
   * module makes, and it is always a RETURN, the same movement type
   * `restock()` uses for a released reservation's stock coming back.
   */
  async returnCancelledStock(
    tx: Prisma.TransactionClient,
    warehouseId: string,
    variantId: string,
    quantity: number,
    reference: { referenceType: string; referenceId: string },
    note?: string,
  ): Promise<{ record: InventoryRecord; movement: InventoryMovement }> {
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    const record = await this.getOrCreateRecordWithClient(
      tx,
      warehouseId,
      variantId,
    );
    const updated = await tx.inventoryRecord.update({
      where: { id: record.id },
      data: { onHand: { increment: quantity } },
    });
    const movement = await this.recordMovement(
      tx,
      record.id,
      InventoryMovementType.RETURN,
      quantity,
      note,
      reference,
    );

    return { record: updated, movement };
  }

  /**
   * The offer-scoped counterpart to `returnCancelledStock` for a #37
   * seller-fulfilled (no-warehouse) committed line — cannot reuse
   * `returnCancelledStock` (requires a warehouseId) or `restock` (restocks a
   * reservation's whole quantity, not an arbitrary partial amount). The
   * InventoryRecord must already exist (a committed seller offer always has
   * one from checkout's InventoryService.reserveOffer/commit), so a missing
   * record is a genuine error, not a lazily-created row.
   */
  async returnCancelledOfferStock(
    tx: Prisma.TransactionClient,
    offerId: string,
    quantity: number,
    reference: { referenceType: string; referenceId: string },
    note?: string,
  ): Promise<{ record: InventoryRecord; movement: InventoryMovement }> {
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    const record = await tx.inventoryRecord.findUnique({ where: { offerId } });
    if (!record) {
      throw new NotFoundException('No inventory record exists for this offer');
    }
    const updated = await tx.inventoryRecord.update({
      where: { id: record.id },
      data: { onHand: { increment: quantity } },
    });
    const movement = await this.recordMovement(
      tx,
      record.id,
      InventoryMovementType.RETURN,
      quantity,
      note,
      reference,
    );

    return { record: updated, movement };
  }

  /**
   * Adds accepted-and-RESTOCK-dispositioned return quantity back onto
   * sellable on-hand. This is the only path by which a customer return
   * increases inventory — QUARANTINE/DAMAGED/DISPOSE dispositions and
   * rejected quantities never call this. Idempotent per `reference` (a
   * return inspection line), same guard `restock()` uses, so retrying a
   * finalize-inspection request never double-counts.
   */
  async receiveReturnedStock(
    tx: Prisma.TransactionClient,
    warehouseId: string,
    variantId: string,
    quantity: number,
    reference: { referenceType: string; referenceId: string },
    note?: string,
  ): Promise<{ record: InventoryRecord; movement: InventoryMovement } | null> {
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    const existing = await tx.inventoryMovement.findFirst({
      where: {
        type: InventoryMovementType.RETURN,
        referenceType: reference.referenceType,
        referenceId: reference.referenceId,
      },
    });
    if (existing) return null;

    const record = await this.getOrCreateRecordWithClient(
      tx,
      warehouseId,
      variantId,
    );
    const updated = await tx.inventoryRecord.update({
      where: { id: record.id },
      data: { onHand: { increment: quantity } },
    });
    const movement = await this.recordMovement(
      tx,
      record.id,
      InventoryMovementType.RETURN,
      quantity,
      note,
      reference,
    );

    return { record: updated, movement };
  }

  /**
   * The inverse of `receiveStockForReference`, for reversing a posted goods
   * receipt. Decrements on-hand with the same floor check as `adjustStock`
   * and tags the movement with the reversal's own reference, so the original
   * receipt line's rows stay untouched (posted receipts are immutable) while
   * the stock effect is fully undone.
   */
  async reverseReceiptStock(
    tx: Prisma.TransactionClient,
    warehouseId: string,
    variantId: string,
    quantity: number,
    reference: { referenceType: string; referenceId: string },
    note?: string,
  ): Promise<{ record: InventoryRecord; movement: InventoryMovement }> {
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    const record = await this.getOrCreateRecordWithClient(
      tx,
      warehouseId,
      variantId,
    );
    // Floors at `reserved`, not zero: on-hand backs active reservations too,
    // and a reversal must never leave less on-hand than is already promised
    // to a reservation holder.
    const affected = await tx.$executeRaw`
      UPDATE inventory_records
      SET on_hand = on_hand - ${quantity}, updated_at = now()
      WHERE id = ${record.id}::uuid AND on_hand - ${quantity} >= reserved
    `;

    if (affected === 0) {
      throw new ConflictException(
        'Reversal would leave on-hand stock below reserved quantity',
      );
    }

    const updated = await tx.inventoryRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
    const movement = await this.recordMovement(
      tx,
      record.id,
      InventoryMovementType.ADJUSTMENT,
      -quantity,
      note,
      reference,
    );

    return { record: updated, movement };
  }

  async adjustStock(
    warehouseId: string,
    variantId: string,
    delta: number,
    note?: string,
    options?: AdjustStockOptions,
  ): Promise<InventoryRecordView> {
    if (
      !Number.isInteger(delta) ||
      delta === 0 ||
      delta < POSTGRES_INTEGER_MIN ||
      delta > POSTGRES_INTEGER_MAX
    ) {
      throw new BadRequestException(
        'delta must be a non-zero PostgreSQL integer',
      );
    }
    if (!options?.actorUserId) {
      throw new BadRequestException('An authenticated actor is required');
    }

    const requestHash = this.hashAdjustmentRequest({
      warehouseId,
      variantId,
      delta,
      ...(note === undefined ? {} : { note }),
    });

    if (options.idempotencyKey) {
      const replay = await this.findAdjustmentReplay(
        options.actorUserId,
        options.idempotencyKey,
        requestHash,
      );
      if (replay) return replay;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const candidate = await tx.inventoryRecord.upsert({
          where: { warehouseId_variantId: { warehouseId, variantId } },
          create: { warehouseId, variantId },
          update: {},
        });
        await tx.$queryRaw`SELECT id FROM inventory_records WHERE id = ${candidate.id}::uuid FOR UPDATE`;
        const before = await tx.inventoryRecord.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        const nextOnHand = BigInt(before.onHand) + BigInt(delta);
        if (
          before.onHand < 0 ||
          before.reserved < 0 ||
          nextOnHand < BigInt(before.reserved) ||
          nextOnHand < 0n ||
          nextOnHand > BigInt(POSTGRES_INTEGER_MAX)
        ) {
          throw new ConflictException(
            'Adjustment would violate available-stock or integer-range limits',
          );
        }

        const updated = await tx.inventoryRecord.update({
          where: { id: before.id },
          data: { onHand: Number(nextOnHand) },
        });
        const movement = await this.recordMovement(
          tx,
          before.id,
          InventoryMovementType.ADJUSTMENT,
          delta,
          note,
        );
        const response = this.toView(updated);

        await this.auditService.record(
          {
            actorUserId: options.actorUserId,
            action: 'inventory.stock.adjusted',
            targetType: 'InventoryRecord',
            targetId: before.id,
            metadata: {
              warehouseId,
              variantId,
              delta,
              ...(note === undefined ? {} : { note }),
              movementId: movement.id,
              before: {
                onHand: before.onHand,
                reserved: before.reserved,
                available: before.onHand - before.reserved,
              },
              after: {
                onHand: updated.onHand,
                reserved: updated.reserved,
                available: updated.onHand - updated.reserved,
              },
            },
            ipAddress: options.ipAddress,
            userAgent: options.userAgent,
          },
          tx,
        );

        if (options.idempotencyKey) {
          await tx.stockAdjustmentReceipt.create({
            data: {
              actorUserId: options.actorUserId,
              idempotencyKey: options.idempotencyKey,
              requestHash,
              response: this.serializeAdjustmentResponse(response),
            },
          });
        }

        return response;
      });
    } catch (error) {
      if (options.idempotencyKey && this.isPrismaError(error, 'P2002')) {
        const replay = await this.findAdjustmentReplay(
          options.actorUserId,
          options.idempotencyKey,
          requestHash,
        );
        if (replay) return replay;
      }
      throw error;
    }
  }

  private async findAdjustmentReplay(
    actorUserId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<InventoryRecordView | null> {
    const receipt = await this.prisma.stockAdjustmentReceipt.findUnique({
      where: { actorUserId_idempotencyKey: { actorUserId, idempotencyKey } },
    });
    if (!receipt) return null;
    if (receipt.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency-Key already used for a different request',
      );
    }
    return this.deserializeAdjustmentResponse(receipt.response);
  }

  private hashAdjustmentRequest(value: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private serializeAdjustmentResponse(
    response: InventoryRecordView,
  ): Prisma.InputJsonObject {
    return {
      ...response,
      createdAt: response.createdAt.toISOString(),
      updatedAt: response.updatedAt.toISOString(),
    };
  }

  private deserializeAdjustmentResponse(
    response: Prisma.JsonValue,
  ): InventoryRecordView {
    const stored = response as unknown as StoredInventoryAdjustmentResponse;
    return {
      ...stored,
      createdAt: new Date(stored.createdAt),
      updatedAt: new Date(stored.updatedAt),
    };
  }

  /**
   * `tx`, when given, runs the whole reservation inside the caller's own
   * transaction instead of opening a new one — the caller's transaction then
   * rolls back the reservation along with everything else in it if a later
   * step fails, rather than leaving a compensating call to undo it.
   */
  async reserve(
    variantId: string,
    quantity: number,
    options: ReserveOptions = {},
    tx?: Prisma.TransactionClient,
  ): Promise<Reservation> {
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    if (!tx)
      return this.prisma.$transaction((client) =>
        this.reserve(variantId, quantity, options, client),
      );
    const candidates = await tx.inventoryRecord.findMany({
      where: {
        variantId,
        offerId: null,
        ...(options.warehouseId ? { warehouseId: options.warehouseId } : {}),
        ...(options.lockedRecordIds
          ? { id: { in: options.lockedRecordIds } }
          : {}),
      },
      select: { id: true },
    });

    if (candidates.length === 0) {
      throw new NotFoundException(
        'No inventory record exists for this variant',
      );
    }

    const candidateIds = sortedUniqueIds(
      candidates.map((candidate) => candidate.id),
    );
    // Lock every candidate before sweeping any, so the sweep's own
    // record-then-reservation locks never interleave with a second record.
    await this.lockInventoryRecords(candidateIds, tx);
    for (const id of candidateIds) await this.sweepExpired(id, tx);

    // Ascending id is the allocation order: a line is served whole by the
    // first record that can hold it, never split across warehouses.
    const refreshed = await tx.inventoryRecord.findMany({
      where: { id: { in: candidateIds } },
      orderBy: { id: 'asc' },
    });
    const target = refreshed.find(
      (record) => record.onHand - record.reserved >= quantity,
    );

    if (!target) {
      throw new ConflictException('Insufficient available stock');
    }

    return this.claimRecord(target, quantity, options, tx);
  }

  private async claimRecord(
    target: InventoryRecord,
    quantity: number,
    options: ReserveOptions,
    tx?: Prisma.TransactionClient,
  ): Promise<Reservation> {
    const ttlSeconds = options.ttlSeconds ?? DEFAULT_RESERVATION_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const claim = async (
      client: Prisma.TransactionClient,
    ): Promise<Reservation> => {
      const affected = await client.$executeRaw`
        UPDATE inventory_records
        SET reserved = reserved + ${quantity}, updated_at = now()
        WHERE id = ${target.id}::uuid AND on_hand - reserved >= ${quantity}
      `;

      if (affected === 0) {
        throw new ConflictException('Insufficient available stock');
      }

      const created = await client.reservation.create({
        data: {
          inventoryRecordId: target.id,
          quantity,
          expiresAt,
          holderType: options.holderType,
          holderId: options.holderId,
        },
      });

      await this.recordMovement(
        client,
        target.id,
        InventoryMovementType.RESERVATION,
        quantity,
        undefined,
        {
          referenceType: 'reservation',
          referenceId: created.id,
        },
      );

      await this.backgroundJobsService.enqueue(
        {
          type: 'inventory.expire_reservation',
          payload: { reservationId: created.id },
          runAt: expiresAt,
        },
        client,
      );

      return created;
    };

    return tx ? claim(tx) : this.prisma.$transaction(claim);
  }

  async reserveOffer(
    offerId: string,
    quantity: number,
    options: ReserveOptions = {},
    tx?: Prisma.TransactionClient,
  ): Promise<Reservation> {
    if (quantity <= 0)
      throw new BadRequestException('quantity must be positive');
    if (!tx)
      return this.prisma.$transaction((client) =>
        this.reserveOffer(offerId, quantity, options, client),
      );
    const record = await tx.inventoryRecord.findUnique({
      where: { offerId },
    });
    // A record the caller's pool lock did not see is treated as absent, as
    // in `reserve`.
    if (
      !record ||
      (options.lockedRecordIds && !options.lockedRecordIds.includes(record.id))
    )
      throw new NotFoundException('No inventory record exists for this offer');
    await this.lockInventoryRecords([record.id], tx);
    await this.sweepExpired(record.id, tx);
    const refreshed = await tx.inventoryRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
    if (refreshed.onHand - refreshed.reserved < quantity)
      throw new ConflictException('Insufficient available stock');
    return this.claimRecord(refreshed, quantity, options, tx);
  }

  async setOfferQuantity(
    offerId: string,
    variantId: string,
    quantity: number,
    version: number,
    actorUserId: string,
    note?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryRecord> {
    if (!tx)
      return this.prisma.$transaction((client) =>
        this.setOfferQuantity(
          offerId,
          variantId,
          quantity,
          version,
          actorUserId,
          note,
          client,
        ),
      );
    let record = await tx.inventoryRecord.findUnique({ where: { offerId } });
    let created = false;
    if (!record) {
      if (version !== 0)
        throw new ConflictException('Inventory changed; reload and try again');
      record = await tx.inventoryRecord.create({
        data: { offerId, variantId },
      });
      created = true;
    }
    const delta = quantity - record.onHand;
    if (delta === 0) {
      if (record.version !== version)
        throw new ConflictException('Inventory changed; reload and try again');
      if (created)
        await this.recordMovement(
          tx,
          record.id,
          InventoryMovementType.ADJUSTMENT,
          0,
          note,
          { referenceType: 'seller_user', referenceId: actorUserId },
        );
      return record;
    }
    const updated = await tx.inventoryRecord.updateMany({
      where: { id: record.id, version, reserved: { lte: quantity } },
      data: { onHand: quantity, version: { increment: 1 } },
    });
    if (updated.count !== 1)
      throw new ConflictException(
        'Inventory changed or quantity is below reserved stock',
      );
    await this.recordMovement(
      tx,
      record.id,
      InventoryMovementType.ADJUSTMENT,
      delta,
      note,
      { referenceType: 'seller_user', referenceId: actorUserId },
    );
    return tx.inventoryRecord.findUniqueOrThrow({ where: { id: record.id } });
  }

  async release(
    reservationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Reservation> {
    if (!tx)
      return this.prisma.$transaction((client) =>
        this.release(reservationId, client),
      );
    const reservation = await this.lockReservation(reservationId, tx);
    return this.releaseLocked(reservation, tx);
  }

  /**
   * Releases several reservations (an order's lines) in one go: every
   * affected inventory record is locked first, in ascending id, then every
   * reservation in ascending id — the global lock order — instead of the
   * record/reservation pairs one at a time, which could deadlock against a
   * concurrent multi-record path. Same per-item semantics as `release`.
   */
  async releaseMany(
    reservationIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Reservation[]> {
    if (!tx)
      return this.prisma.$transaction((client) =>
        this.releaseMany(reservationIds, client),
      );
    const reservations = await this.lockReservations(reservationIds, tx);
    const released: Reservation[] = [];
    for (const reservation of reservations)
      released.push(await this.releaseLocked(reservation, tx));
    return released;
  }

  private releaseLocked(
    reservation: Reservation,
    tx: Prisma.TransactionClient,
  ): Promise<Reservation> {
    // Idempotent: already released or expired stock was returned once.
    if (reservation.status !== ReservationStatus.ACTIVE)
      return Promise.resolve(reservation);
    return this.finalizeReservation(
      reservation,
      ReservationStatus.RELEASED,
      tx,
    );
  }

  async expireReservation(
    reservationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!tx)
      return this.prisma.$transaction((client) =>
        this.expireReservation(reservationId, client),
      );
    const reservation = await this.lockReservation(reservationId, tx);
    if (
      reservation.status !== ReservationStatus.ACTIVE ||
      reservation.expiresAt > new Date()
    )
      return;
    await this.finalizeReservation(reservation, ReservationStatus.EXPIRED, tx);
  }

  async commit(
    reservationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Reservation> {
    if (!tx)
      return this.prisma.$transaction((client) =>
        this.commit(reservationId, client),
      );
    const reservation = await this.lockReservation(reservationId, tx);
    return this.commitLocked(reservation, tx);
  }

  /** `releaseMany`'s counterpart for payment: same lock order as there. */
  async commitMany(
    reservationIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Reservation[]> {
    if (!tx)
      return this.prisma.$transaction((client) =>
        this.commitMany(reservationIds, client),
      );
    const reservations = await this.lockReservations(reservationIds, tx);
    const committed: Reservation[] = [];
    for (const reservation of reservations)
      committed.push(await this.commitLocked(reservation, tx));
    return committed;
  }

  private async commitLocked(
    reservation: Reservation,
    tx: Prisma.TransactionClient,
  ): Promise<Reservation> {
    if (reservation.status === ReservationStatus.COMMITTED) return reservation;
    if (reservation.status !== ReservationStatus.ACTIVE) {
      throw new ConflictException(
        `Cannot commit a reservation with status ${reservation.status}`,
      );
    }
    const affected = await tx.$executeRaw`
      UPDATE inventory_records
      SET on_hand = on_hand - ${reservation.quantity}, reserved = reserved - ${reservation.quantity}, updated_at = now()
      WHERE id = ${reservation.inventoryRecordId}::uuid AND on_hand >= ${reservation.quantity} AND reserved >= ${reservation.quantity}
    `;
    if (affected === 0)
      throw new ConflictException(
        'Inventory record state does not allow committing this reservation',
      );
    const committed = await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.COMMITTED },
    });
    await this.recordMovement(
      tx,
      reservation.inventoryRecordId,
      InventoryMovementType.COMMITMENT,
      reservation.quantity,
      undefined,
      { referenceType: 'reservation', referenceId: reservation.id },
    );
    return committed;
  }

  async restock(
    reservationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!tx)
      return this.prisma.$transaction((client) =>
        this.restock(reservationId, client),
      );
    const reservation = await this.lockReservation(reservationId, tx);
    if (reservation.status !== ReservationStatus.COMMITTED) return;
    const returned = await tx.inventoryMovement.findFirst({
      where: {
        type: InventoryMovementType.RETURN,
        referenceType: 'reservation',
        referenceId: reservationId,
      },
    });
    if (returned) return;
    await tx.$executeRaw`
      UPDATE inventory_records SET on_hand = on_hand + ${reservation.quantity}, updated_at = now()
      WHERE id = ${reservation.inventoryRecordId}::uuid
    `;
    await this.recordMovement(
      tx,
      reservation.inventoryRecordId,
      InventoryMovementType.RETURN,
      reservation.quantity,
      undefined,
      { referenceType: 'reservation', referenceId: reservationId },
    );
  }

  async sweepExpired(
    inventoryRecordId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!tx)
      return this.prisma.$transaction((client) =>
        this.sweepExpired(inventoryRecordId, client),
      );
    await this.lockInventoryRecords([inventoryRecordId], tx);
    const expired = await tx.reservation.findMany({
      where: {
        inventoryRecordId,
        status: ReservationStatus.ACTIVE,
        expiresAt: { lt: new Date() },
      },
      orderBy: { id: 'asc' },
    });
    for (const reservation of expired)
      await this.expireReservation(reservation.id, tx);
  }

  private async finalizeReservation(
    reservation: Reservation,
    status:
      | typeof ReservationStatus.RELEASED
      | typeof ReservationStatus.EXPIRED,
    tx: Prisma.TransactionClient,
  ): Promise<Reservation> {
    const affected = await tx.$executeRaw`
      UPDATE inventory_records SET reserved = reserved - ${reservation.quantity}, updated_at = now()
      WHERE id = ${reservation.inventoryRecordId}::uuid AND reserved >= ${reservation.quantity}
    `;
    if (affected === 0)
      throw new ConflictException(
        'Inventory reservation counters require reconciliation',
      );
    const updated = await tx.reservation.update({
      where: { id: reservation.id },
      data: { status },
    });
    await this.recordMovement(
      tx,
      reservation.inventoryRecordId,
      InventoryMovementType.RELEASE,
      reservation.quantity,
      status === ReservationStatus.EXPIRED ? 'expired' : undefined,
      { referenceType: 'reservation', referenceId: reservation.id },
    );
    return updated;
  }

  private async lockReservation(
    id: string,
    tx: Prisma.TransactionClient,
  ): Promise<Reservation> {
    // Match reserve/sweep ordering: inventory row, then reservation row. A
    // reservation's record never changes, so the unlocked first read is
    // enough to know which record to lock.
    const initial = await tx.reservation.findUnique({ where: { id } });
    if (!initial) throw new NotFoundException('Reservation not found');
    await this.lockInventoryRecords([initial.inventoryRecordId], tx);
    await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${id}::uuid FOR UPDATE`;
    const reservation = await tx.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    return reservation;
  }

  /**
   * The multi-reservation form of `lockReservation`: all their inventory
   * records (ascending id), then all the reservations (ascending id).
   * Returns them re-read under the lock, in ascending id.
   */
  private async lockReservations(
    ids: string[],
    tx: Prisma.TransactionClient,
  ): Promise<Reservation[]> {
    const reservationIds = sortedUniqueIds(ids);
    if (reservationIds.length === 0) return [];
    const initial = await tx.reservation.findMany({
      where: { id: { in: reservationIds } },
      select: { id: true, inventoryRecordId: true },
    });
    if (initial.length !== reservationIds.length)
      throw new NotFoundException('Reservation not found');
    await this.lockInventoryRecords(
      initial.map((reservation) => reservation.inventoryRecordId),
      tx,
    );
    for (const id of reservationIds)
      await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${id}::uuid FOR UPDATE`;
    const reservations = await tx.reservation.findMany({
      where: { id: { in: reservationIds } },
    });
    if (reservations.length !== reservationIds.length)
      throw new NotFoundException('Reservation not found');
    return reservations.sort((left, right) => compareIds(left.id, right.id));
  }

  private recordMovement(
    client: InventoryClient,
    inventoryRecordId: string,
    type: InventoryMovementType,
    quantity: number,
    note?: string,
    reference?: { referenceType: string; referenceId: string },
  ): Promise<InventoryMovement> {
    return client.inventoryMovement.create({
      data: {
        inventoryRecordId,
        type,
        quantity,
        note,
        referenceType: reference?.referenceType,
        referenceId: reference?.referenceId,
      },
    });
  }

  private toView(record: InventoryRecord): InventoryRecordView {
    return { ...record, available: record.onHand - record.reserved };
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
