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
      where: filter,
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) => this.toView(record));
  }

  async getAvailableQuantity(variantId: string): Promise<number> {
    const records = await this.prisma.inventoryRecord.findMany({
      where: { variantId },
    });
    return records.reduce(
      (sum, record) => sum + (record.onHand - record.reserved),
      0,
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
    const existing = await this.prisma.inventoryRecord.findUnique({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });

    if (existing) {
      return existing;
    }

    try {
      return await this.prisma.inventoryRecord.create({
        data: { warehouseId, variantId },
      });
    } catch (error) {
      if (!this.isPrismaError(error, 'P2002')) {
        throw error;
      }

      // Lost a create race; the winner's row exists now.
      return this.prisma.inventoryRecord.findUniqueOrThrow({
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

  async reserve(
    variantId: string,
    quantity: number,
    options: ReserveOptions = {},
  ): Promise<Reservation> {
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }

    const candidates = await this.prisma.inventoryRecord.findMany({
      where: {
        variantId,
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

    const refreshed = await this.prisma.inventoryRecord.findMany({
      where: { id: { in: candidates.map((candidate) => candidate.id) } },
    });
    const target = refreshed.find(
      (record) => record.onHand - record.reserved >= quantity,
    );

    if (!target) {
      throw new ConflictException('Insufficient available stock');
    }

    const ttlSeconds = options.ttlSeconds ?? DEFAULT_RESERVATION_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const reservation = await this.prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE inventory_records
        SET reserved = reserved + ${quantity}, updated_at = now()
        WHERE id = ${target.id}::uuid AND on_hand - reserved >= ${quantity}
      `;

      if (affected === 0) {
        throw new ConflictException('Insufficient available stock');
      }

      const created = await tx.reservation.create({
        data: {
          inventoryRecordId: target.id,
          quantity,
          expiresAt,
          holderType: options.holderType,
          holderId: options.holderId,
        },
      });

      await this.recordMovement(
        tx,
        target.id,
        InventoryMovementType.RESERVATION,
        quantity,
        undefined,
        {
          referenceType: 'reservation',
          referenceId: created.id,
        },
      );

      return created;
    });

    await this.backgroundJobsService.enqueue({
      type: 'inventory.expire_reservation',
      payload: { reservationId: reservation.id },
      runAt: expiresAt,
    });

    return reservation;
  }

  async release(reservationId: string): Promise<Reservation> {
    const reservation = await this.findReservationOrThrow(reservationId);

    if (reservation.status !== ReservationStatus.ACTIVE) {
      return reservation;
    }

    return this.finalizeReservation(reservation, ReservationStatus.RELEASED);
  }

  // Called by the expiry worker once a reservation's TTL has passed. A
  // non-ACTIVE reservation here means commit()/release() already won the
  // race, which is expected, not an error.
  async expireReservation(reservationId: string): Promise<void> {
    const reservation = await this.findReservationOrThrow(reservationId);

    if (reservation.status !== ReservationStatus.ACTIVE) {
      return;
    }

    await this.finalizeReservation(reservation, ReservationStatus.EXPIRED);
  }

  async commit(reservationId: string): Promise<Reservation> {
    const reservation = await this.findReservationOrThrow(reservationId);

    if (reservation.status === ReservationStatus.COMMITTED) {
      return reservation;
    }

    if (reservation.status !== ReservationStatus.ACTIVE) {
      throw new ConflictException(
        `Cannot commit a reservation with status ${reservation.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE inventory_records
        SET on_hand = on_hand - ${reservation.quantity}, reserved = reserved - ${reservation.quantity}, updated_at = now()
        WHERE id = ${reservation.inventoryRecordId}::uuid AND on_hand >= ${reservation.quantity} AND reserved >= ${reservation.quantity}
      `;

      if (affected === 0) {
        throw new ConflictException(
          'Inventory record state does not allow committing this reservation',
        );
      }

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
        {
          referenceType: 'reservation',
          referenceId: reservation.id,
        },
      );

      return committed;
    });
  }

  // Called when a fully-refunded order line's stock is returned to sellable
  // inventory. Only a COMMITTED reservation has anything to return - it's a
  // no-op for anything else, mirroring expireReservation()'s tolerance of an
  // already-resolved reservation. Only onHand is touched (reserved was
  // already zeroed by commit()); the Reservation itself stays COMMITTED -
  // that's still historically accurate, the restock is captured by the
  // RETURN movement instead of a reservation-state change.
  async restock(reservationId: string): Promise<void> {
    const reservation = await this.findReservationOrThrow(reservationId);

    if (reservation.status !== ReservationStatus.COMMITTED) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE inventory_records
        SET on_hand = on_hand + ${reservation.quantity}, updated_at = now()
        WHERE id = ${reservation.inventoryRecordId}::uuid
      `;

      await this.recordMovement(
        tx,
        reservation.inventoryRecordId,
        InventoryMovementType.RETURN,
        reservation.quantity,
        undefined,
        {
          referenceType: 'reservation',
          referenceId: reservation.id,
        },
      );
    });
  }

  // Called inline by reserve() before checking availability; also exported
  // for a future worker/cron to call directly once one exists.
  async sweepExpired(inventoryRecordId: string): Promise<void> {
    const expired = await this.prisma.reservation.findMany({
      where: {
        inventoryRecordId,
        status: ReservationStatus.ACTIVE,
        expiresAt: { lt: new Date() },
      },
    });

    for (const reservation of expired) {
      await this.finalizeReservation(reservation, ReservationStatus.EXPIRED);
    }
  }

  private async finalizeReservation(
    reservation: Reservation,
    status:
      | typeof ReservationStatus.RELEASED
      | typeof ReservationStatus.EXPIRED,
  ): Promise<Reservation> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE inventory_records
        SET reserved = GREATEST(reserved - ${reservation.quantity}, 0), updated_at = now()
        WHERE id = ${reservation.inventoryRecordId}::uuid
      `;

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
    });
  }

  private async findReservationOrThrow(
    reservationId: string,
  ): Promise<Reservation> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

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
