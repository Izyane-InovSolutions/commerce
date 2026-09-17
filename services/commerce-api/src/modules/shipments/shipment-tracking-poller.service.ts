import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { ShipmentsService } from './shipments.service';

const POLL_INTERVAL_MS = 60_000;

/**
 * Periodically asks each non-terminal shipment's carrier for new tracking
 * events (CarrierProvider.poll) — the reconciliation path for carriers that
 * don't push webhooks, and a backstop for ones that do. A no-op today: the
 * MANUAL carrier's poll() always returns nothing, since there is no real
 * courier behind it.
 */
@Injectable()
export class ShipmentTrackingPollerService {
  private readonly logger = new Logger(ShipmentTrackingPollerService.name);

  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Interval(POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    try {
      await this.shipmentsService.pollNonTerminalShipments();
    } catch (error) {
      this.logger.error(
        'Shipment tracking poll failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
