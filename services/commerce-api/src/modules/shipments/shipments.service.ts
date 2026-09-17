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
  Role,
  ShipmentStatus,
  TrackingEventSource,
  type Shipment,
  type TrackingEvent,
} from '@prisma/client';

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from '../../common/pagination/pagination-query.dto';
import { NumberingService } from '../../common/numbering/numbering.service';
import { PrismaService } from '../../database/prisma.service';
import { OutboxService } from '../../infrastructure/jobs/outbox.service';
import { AuditService } from '../audit/audit.service';
import { FulfillmentsService } from '../fulfillment/fulfillments.service';
import { CarrierProviderRegistry } from './carrier-provider.registry';
import { AddTrackingEventDto } from './dto/add-tracking-event.dto';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { ListShipmentsDto } from './dto/list-shipments.dto';
import { isTerminalShipmentStatus, projectShipmentStatus } from './tracking-status';
import { CustomerShipmentView, ShipmentPage, ShipmentWithLines } from './shipments.types';

type RecordEventInput = {
  source: TrackingEventSource;
  providerEventKey?: string;
  rawStatus?: string;
  normalizedStatus: ShipmentStatus;
  description?: string;
  location?: string;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
  isCorrection: boolean;
  correctionReason?: string;
  actorUserId?: string;
};

const NON_TERMINAL_STATUSES = Object.values(ShipmentStatus).filter(
  (status) => !isTerminalShipmentStatus(status),
);

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfillmentsService: FulfillmentsService,
    private readonly numberingService: NumberingService,
    private readonly carrierProviderRegistry: CarrierProviderRegistry,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  async findAll(query: ListShipmentsDto): Promise<ShipmentPage> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.ShipmentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.fulfillmentOrderId ? { fulfillmentOrderId: query.fulfillmentOrderId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.shipment.findMany({
        where,
        include: { lines: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.shipment.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: string): Promise<ShipmentWithLines> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  listTrackingEvents(shipmentId: string): Promise<TrackingEvent[]> {
    return this.prisma.trackingEvent.findMany({
      where: { shipmentId },
      orderBy: { occurredAt: 'desc' },
    });
  }

  /** No warehouse/staff detail — safe for the order's own customer. */
  async getCustomerShipments(
    userId: string,
    orderId: string,
  ): Promise<CustomerShipmentView[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    const shipments = await this.prisma.shipment.findMany({
      where: { orderId },
      include: {
        shippingGroup: { select: { methodName: true } },
        trackingEvents: { orderBy: { occurredAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return shipments.map((shipment) => ({
      id: shipment.id,
      shipmentNumber: shipment.shipmentNumber,
      status: shipment.status,
      methodName: shipment.shippingGroup.methodName,
      trackingReference: shipment.trackingReference,
      estimatedDeliveryAt: shipment.estimatedDeliveryAt,
      events: shipment.trackingEvents.map((event) => ({
        normalizedStatus: event.normalizedStatus,
        description: event.description,
        location: event.location,
        occurredAt: event.occurredAt,
      })),
    }));
  }

  /**
   * Allocates packed quantity off the fulfillment order's lines
   * (FulfillmentsService.assignShipmentQuantity) and creates the shipment in
   * the same transaction — a retried request with the same idempotency key
   * returns the original shipment instead of double-allocating.
   */
  async create(
    dto: CreateShipmentDto,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<ShipmentWithLines> {
    if (new Set(dto.lines.map((line) => line.fulfillmentLineId)).size !== dto.lines.length) {
      throw new BadRequestException('Each fulfillment line may appear only once per shipment');
    }

    const existing = await this.prisma.shipment.findUnique({
      where: { bookingIdempotencyKey: idempotencyKey },
      include: { lines: true },
    });
    if (existing) return this.validateCreateReplay(existing, dto);

    return this.prisma.$transaction(async (tx) => {
      // Serialize create attempts for the same fulfillment order, then
      // re-check the key so concurrent identical requests replay cleanly.
      await tx.$queryRaw`SELECT id FROM fulfillment_orders WHERE id = ${dto.fulfillmentOrderId}::uuid FOR UPDATE`;
      const replay = await tx.shipment.findUnique({
        where: { bookingIdempotencyKey: idempotencyKey },
        include: { lines: true },
      });
      if (replay) return this.validateCreateReplay(replay, dto);

      const fo = await this.fulfillmentsService.assignShipmentQuantity(
        tx,
        dto.fulfillmentOrderId,
        dto.lines,
      );
      const shippingGroup = await tx.shippingGroup.findUniqueOrThrow({
        where: { id: fo.shippingGroupId },
        select: { providerCode: true, carrierCode: true, methodCode: true },
      });
      // Fail before persisting a shipment if checkout selected a provider
      // that is not actually installed in this deployment.
      this.carrierProviderRegistry.get(shippingGroup.providerCode);
      const orderItemByLineId = new Map(fo.lines.map((line) => [line.id, line.orderItemId]));
      const shipmentNumber = await this.numberingService.nextShipmentNumber(tx);

      let shipment: ShipmentWithLines;
      try {
        shipment = await tx.shipment.create({
          data: {
            shipmentNumber,
            orderId: fo.orderId,
            sellerOrderId: fo.sellerOrderId,
            shippingGroupId: fo.shippingGroupId,
            fulfillmentOrderId: fo.id,
            warehouseId: fo.warehouseId,
            providerCode: shippingGroup.providerCode,
            carrierCode: shippingGroup.carrierCode,
            methodCode: shippingGroup.methodCode,
            bookingIdempotencyKey: idempotencyKey,
            lines: {
              create: dto.lines.map((line) => {
                const orderItemId = orderItemByLineId.get(line.fulfillmentLineId);
                if (!orderItemId) {
                  throw new NotFoundException(
                    `Fulfillment line ${line.fulfillmentLineId} not found`,
                  );
                }
                return {
                  fulfillmentLineId: line.fulfillmentLineId,
                  orderItemId,
                  quantity: line.quantity,
                };
              }),
            },
          },
          include: { lines: true },
        });
      } catch (error) {
        throw this.mapWriteError(error);
      }

      await this.auditService.record(
        {
          actorUserId,
          action: 'shipment.created',
          targetType: 'Shipment',
          targetId: shipment.id,
          metadata: { fulfillmentOrderId: dto.fulfillmentOrderId, shipmentNumber },
        },
        tx,
      );

      return shipment;
    });
  }

  async book(shipmentId: string, actorUserId: string): Promise<ShipmentWithLines> {
    return this.prisma.$transaction(async (tx) => {
      const shipment = await this.lockShipment(tx, shipmentId);
      if (shipment.status === ShipmentStatus.BOOKED) {
        return tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { lines: true } });
      }
      if (shipment.status !== ShipmentStatus.PENDING_BOOKING) {
        throw new ConflictException(`Cannot book a shipment with status ${shipment.status}`);
      }

      const order = await tx.order.findUniqueOrThrow({
        where: { id: shipment.orderId },
        select: { shippingAddress: true },
      });
      const destinationCountry = this.extractCountry(order.shippingAddress);

      const provider = this.carrierProviderRegistry.get(shipment.providerCode);
      const result = await provider.book({
        shipmentId: shipment.id,
        shipmentNumber: shipment.shipmentNumber,
        carrierCode: shipment.carrierCode,
        methodCode: shipment.methodCode,
        destinationCountry,
      });

      const booked = await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: ShipmentStatus.BOOKED,
          trackingReference: result.trackingReference,
          estimatedDeliveryAt: result.estimatedDeliveryAt,
          bookedAt: new Date(),
          version: { increment: 1 },
        },
        include: { lines: true },
      });

      await this.auditService.record(
        {
          actorUserId,
          action: 'shipment.booked',
          targetType: 'Shipment',
          targetId: shipment.id,
          metadata: { trackingReference: result.trackingReference },
        },
        tx,
      );
      await this.outboxService.record(
        {
          topic: 'shipment.booked',
          aggregateType: 'Shipment',
          aggregateId: shipment.id,
          payload: { orderId: shipment.orderId, trackingReference: result.trackingReference },
        },
        tx,
      );

      return booked;
    });
  }

  /** Only PENDING_BOOKING/BOOKED shipments may be cancelled — a dispatched
   * or terminal shipment must go through the #30 return workflow instead. */
  async cancel(
    shipmentId: string,
    reason: string,
    actorUserId: string,
  ): Promise<ShipmentWithLines> {
    return this.prisma.$transaction(async (tx) => {
      const shipment = await this.lockShipmentWithLines(tx, shipmentId);
      if (shipment.status === ShipmentStatus.CANCELLED) return shipment;
      if (
        shipment.status !== ShipmentStatus.PENDING_BOOKING &&
        shipment.status !== ShipmentStatus.BOOKED
      ) {
        throw new ConflictException(`Cannot cancel a shipment with status ${shipment.status}`);
      }

      const provider = this.carrierProviderRegistry.get(shipment.providerCode);
      await provider.cancel(shipment.trackingReference);

      await this.fulfillmentsService.releaseShipmentQuantity(
        tx,
        shipment.fulfillmentOrderId,
        shipment.lines.map((line) => ({
          fulfillmentLineId: line.fulfillmentLineId,
          quantity: line.quantity,
        })),
      );

      const cancelled = await tx.shipment.update({
        where: { id: shipmentId },
        data: { status: ShipmentStatus.CANCELLED, cancelledAt: new Date(), version: { increment: 1 } },
        include: { lines: true },
      });

      await this.auditService.record(
        {
          actorUserId,
          action: 'shipment.cancelled',
          targetType: 'Shipment',
          targetId: shipment.id,
          metadata: { reason },
        },
        tx,
      );

      return cancelled;
    });
  }

  async addManualTrackingEvent(
    shipmentId: string,
    dto: AddTrackingEventDto,
    actorUserId: string,
    actorRole: Role,
  ): Promise<TrackingEvent> {
    if (dto.isCorrection && actorRole !== Role.ADMIN) {
      throw new ForbiddenException('Only an administrator may correct tracking history');
    }
    return this.prisma.$transaction((tx) =>
      this.recordTrackingEvent(tx, shipmentId, {
        source: dto.isCorrection
          ? TrackingEventSource.ADMIN_CORRECTION
          : TrackingEventSource.ADMIN_MANUAL,
        normalizedStatus: dto.normalizedStatus,
        description: dto.description,
        location: dto.location,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        isCorrection: dto.isCorrection ?? false,
        correctionReason: dto.correctionReason,
        actorUserId,
      }),
    );
  }

  /**
   * Ingests a carrier webhook: dedupes the delivery first (before any event
   * is parsed into history), then applies each event the same way a manual
   * or polled one is applied. A delivery already recorded — a carrier retry
   * — is a no-op, not a re-application.
   */
  async ingestWebhook(
    providerCode: string,
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<void> {
    const provider = this.carrierProviderRegistry.get(providerCode);
    if (!provider.parseWebhook) {
      throw new NotFoundException(`Carrier "${providerCode}" does not accept webhooks`);
    }
    const parsed = provider.parseWebhook(payload, headers);
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    let delivery;
    try {
      delivery = await this.prisma.carrierWebhookDelivery.create({
        data: {
          providerCode,
          providerDeliveryId: parsed.providerDeliveryId,
          payloadHash,
          status: 'PENDING',
        },
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) return;
      throw error;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const event of parsed.events) {
          const shipment = await tx.shipment.findFirst({
            where: { providerCode, trackingReference: event.trackingReference },
          });
          if (!shipment) continue;
          await this.recordTrackingEvent(tx, shipment.id, {
            source: TrackingEventSource.CARRIER_WEBHOOK,
            providerEventKey: event.providerEventKey,
            rawStatus: event.rawStatus,
            normalizedStatus: event.normalizedStatus,
            description: event.description,
            location: event.location,
            occurredAt: event.occurredAt,
            metadata: event.metadata,
            isCorrection: false,
          });
        }
        await tx.carrierWebhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
      });
    } catch (error) {
      // This update deliberately runs after the processing transaction has
      // rolled back, so the failed delivery remains visible for operations.
      await this.prisma.carrierWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          failureReason: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  /** Polls every non-terminal shipment's carrier for new events — see
   * ShipmentTrackingPollerService, which calls this on an interval. */
  async pollNonTerminalShipments(): Promise<void> {
    const shipments = await this.prisma.shipment.findMany({
      where: { status: { in: NON_TERMINAL_STATUSES } },
    });

    for (const shipment of shipments) {
      const provider = this.carrierProviderRegistry.get(shipment.providerCode);
      const events = await provider.poll(shipment.trackingReference);
      for (const event of events) {
        await this.prisma.$transaction((tx) =>
          this.recordTrackingEvent(tx, shipment.id, {
            source: TrackingEventSource.CARRIER_POLL,
            providerEventKey: event.providerEventKey,
            rawStatus: event.rawStatus,
            normalizedStatus: event.normalizedStatus,
            description: event.description,
            location: event.location,
            occurredAt: event.occurredAt,
            metadata: event.metadata,
            isCorrection: false,
          }),
        );
      }
    }
  }

  private async recordTrackingEvent(
    tx: Prisma.TransactionClient,
    shipmentId: string,
    input: RecordEventInput,
  ): Promise<TrackingEvent> {
    const shipment = await this.lockShipment(tx, shipmentId);
    const latest = await tx.trackingEvent.findFirst({
      where: { shipmentId },
      orderBy: { occurredAt: 'desc' },
    });

    let event: TrackingEvent;
    try {
      event = await tx.trackingEvent.create({
        data: {
          shipmentId,
          source: input.source,
          providerEventKey: input.providerEventKey,
          rawStatus: input.rawStatus,
          normalizedStatus: input.normalizedStatus,
          description: input.description,
          location: input.location,
          occurredAt: input.occurredAt,
          actorUserId: input.actorUserId,
          isCorrection: input.isCorrection,
          correctionReason: input.correctionReason,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      // Same (shipmentId, source, providerEventKey) already recorded — a
      // carrier or poll replay, not a new event; nothing to project.
      if (this.isPrismaError(error, 'P2002') && latest) return latest;
      throw error;
    }

    const newStatus = projectShipmentStatus({
      currentStatus: shipment.status,
      latestEventOccurredAt: latest?.occurredAt ?? null,
      newEvent: {
        normalizedStatus: input.normalizedStatus,
        occurredAt: input.occurredAt,
        isCorrection: input.isCorrection,
      },
    });

    if (newStatus !== shipment.status) {
      await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: newStatus,
          deliveredAt: newStatus === ShipmentStatus.DELIVERED ? input.occurredAt : shipment.deliveredAt,
          cancelledAt: newStatus === ShipmentStatus.CANCELLED ? input.occurredAt : shipment.cancelledAt,
          version: { increment: 1 },
        },
      });
    }

    return event;
  }

  private async lockShipment(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<Shipment> {
    await tx.$queryRaw`SELECT id FROM shipments WHERE id = ${id}::uuid FOR UPDATE`;
    const shipment = await tx.shipment.findUnique({ where: { id } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  private async lockShipmentWithLines(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<ShipmentWithLines> {
    await tx.$queryRaw`SELECT id FROM shipments WHERE id = ${id}::uuid FOR UPDATE`;
    const shipment = await tx.shipment.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  private extractCountry(shippingAddress: Prisma.JsonValue): string {
    if (
      typeof shippingAddress === 'object' &&
      shippingAddress !== null &&
      !Array.isArray(shippingAddress) &&
      typeof (shippingAddress as { country?: unknown }).country === 'string'
    ) {
      return (shippingAddress as { country: string }).country;
    }
    throw new ConflictException('Order shipping address is missing a country');
  }

  private validateCreateReplay(
    existing: ShipmentWithLines,
    dto: CreateShipmentDto,
  ): ShipmentWithLines {
    const existingLines = existing.lines
      .map((line) => `${line.fulfillmentLineId}:${line.quantity}`)
      .sort();
    const requestedLines = dto.lines
      .map((line) => `${line.fulfillmentLineId}:${line.quantity}`)
      .sort();
    if (
      existing.fulfillmentOrderId !== dto.fulfillmentOrderId ||
      existingLines.length !== requestedLines.length ||
      existingLines.some((line, index) => line !== requestedLines[index])
    ) {
      throw new ConflictException('Idempotency-Key already used for a different request');
    }
    return existing;
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
