import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { JobHandler } from '../../../infrastructure/jobs/job-handler.interface';
import { FulfillmentProvisioningService } from '../provisioning/fulfillment-provisioning.service';

export const FULFILLMENT_PROVISION_JOB_TYPE = 'fulfillment.provision';

@Injectable()
export class FulfillmentProvisionHandler implements JobHandler {
  readonly type = FULFILLMENT_PROVISION_JOB_TYPE;

  constructor(
    private readonly provisioningService: FulfillmentProvisioningService,
  ) {}

  async handle(payload: Prisma.JsonValue): Promise<void> {
    const orderId = this.parseOrderId(payload);
    await this.provisioningService.provisionForOrder(orderId);
  }

  private parseOrderId(payload: Prisma.JsonValue): string {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      typeof (payload as { orderId?: unknown }).orderId !== 'string'
    ) {
      throw new Error(
        `Malformed ${FULFILLMENT_PROVISION_JOB_TYPE} payload: expected { orderId: string }`,
      );
    }
    return (payload as { orderId: string }).orderId;
  }
}
