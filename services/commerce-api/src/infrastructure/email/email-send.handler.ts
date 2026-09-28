import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { JobHandler } from '../jobs/job-handler.interface';
import { EmailDeliveriesService } from './email-deliveries.service';

@Injectable()
export class EmailSendHandler implements JobHandler {
  readonly type = 'email.send';

  constructor(private readonly deliveries: EmailDeliveriesService) {}

  async handle(payload: Prisma.JsonValue): Promise<void> {
    const deliveryId = readDeliveryId(payload);
    await this.deliveries.send(deliveryId);
  }

  async onDeadLetter(payload: Prisma.JsonValue): Promise<void> {
    await this.deliveries.failPermanently(
      readDeliveryId(payload),
      'DELIVERY_RETRIES_EXHAUSTED',
    );
  }
}

function readDeliveryId(payload: Prisma.JsonValue): string {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    typeof payload.deliveryId !== 'string'
  ) {
    throw new Error('INVALID_EMAIL_JOB_PAYLOAD');
  }
  return payload.deliveryId;
}
