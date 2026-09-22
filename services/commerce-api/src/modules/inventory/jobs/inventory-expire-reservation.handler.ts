import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { JobHandler } from '../../../infrastructure/jobs/job-handler.interface';
import { InventoryService } from '../inventory.service';

export const INVENTORY_EXPIRE_RESERVATION_JOB_TYPE =
  'inventory.expire_reservation';

@Injectable()
export class InventoryExpireReservationHandler implements JobHandler {
  readonly type = INVENTORY_EXPIRE_RESERVATION_JOB_TYPE;

  constructor(private readonly inventoryService: InventoryService) {}

  async handle(payload: Prisma.JsonValue): Promise<void> {
    const reservationId = this.parseReservationId(payload);
    await this.inventoryService.expireReservation(reservationId);
  }

  private parseReservationId(payload: Prisma.JsonValue): string {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      typeof (payload as { reservationId?: unknown }).reservationId !== 'string'
    ) {
      throw new Error(
        'Malformed inventory.expire_reservation payload: expected { reservationId: string }',
      );
    }

    return (payload as { reservationId: string }).reservationId;
  }
}
