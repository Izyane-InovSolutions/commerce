import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  ReservationStatus,
  type InventoryMovement,
  type InventoryRecord,
  type Prisma,
  type Reservation,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { BackgroundJobsService } from '../../infrastructure/jobs/background-jobs.service';
import { InventoryRecordView, ReserveOptions } from './inventory.types';

const DEFAULT_RESERVATION_TTL_SECONDS = 15 * 60;

type InventoryClient = Pick<
  Prisma.TransactionClient,
  'inventoryMovement' | 'inventoryRecord' | 'reservation' | '$executeRaw'
>;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backgroundJobsService: BackgroundJobsService,
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
      quantity,
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
  ): Promise<InventoryRecordView> {
    if (delta === 0) {
      throw new BadRequestException('delta must be non-zero');
    }

    const record = await this.getOrCreateRecord(warehouseId, variantId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE inventory_records
        SET on_hand = on_hand + ${delta}, updated_at = now()
        WHERE id = ${record.id}::uuid AND on_hand + ${delta} >= 0
      `;

      if (affected === 0) {
        throw new ConflictException(
          'This adjustment would make on-hand stock negative',
        );
      }

      await this.recordMovement(
        tx,
        record.id,
        InventoryMovementType.ADJUSTMENT,
        Math.abs(delta),
        note,
      );
      return tx.inventoryRecord.findUniqueOrThrow({ where: { id: record.id } });
    });

    return this.toView(updated);
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

    const client = tx ?? this.prisma;
    const candidates = await client.inventoryRecord.findMany({
      where: {
        variantId,
        offerId: null,
        ...(options.warehouseId ? { warehouseId: options.warehouseId } : {}),
      },
    });

    if (candidates.length === 0) {
      throw new NotFoundException(
        'No inventory record exists for this variant',
      );
    }

    for (const candidate of candidates) {
      await this.sweepExpired(candidate.id);
    }

    const refreshed = await client.inventoryRecord.findMany({
      where: { id: { in: candidates.map((candidate) => candidate.id) } },
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
    const client = tx ?? this.prisma;
    const record = await client.inventoryRecord.findUnique({
      where: { offerId },
    });
    if (!record)
      throw new NotFoundException('No inventory record exists for this offer');
    await this.sweepExpired(record.id);
    const refreshed = await client.inventoryRecord.findUniqueOrThrow({
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
    if (reservation.status !== ReservationStatus.ACTIVE) return reservation;
    return this.finalizeReservation(
      reservation,
      ReservationStatus.RELEASED,
      tx,
    );
  }

  async expireReservation(reservationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reservation = await this.lockReservation(reservationId, tx);
      if (
        reservation.status !== ReservationStatus.ACTIVE ||
        reservation.expiresAt > new Date()
      )
        return;
      await this.finalizeReservation(
        reservation,
        ReservationStatus.EXPIRED,
        tx,
      );
    });
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
      where: { id: reservationId },
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

  async sweepExpired(inventoryRecordId: string): Promise<void> {
    const expired = await this.prisma.reservation.findMany({
      where: {
        inventoryRecordId,
        status: ReservationStatus.ACTIVE,
        expiresAt: { lt: new Date() },
      },
      orderBy: { id: 'asc' },
    });
    for (const reservation of expired)
      await this.expireReservation(reservation.id);
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
    await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${id}::uuid FOR UPDATE`;
    const reservation = await tx.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    return reservation;
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
