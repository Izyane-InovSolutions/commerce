import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { LedgerService } from '../ledger.service';
import { PayoutsService } from './payouts.service';

@Injectable()
export class PayoutProcessingService {
  private readonly logger = new Logger(PayoutProcessingService.name);
  private running = false;

  constructor(
    private readonly payouts: PayoutsService,
    private readonly ledger: LedgerService,
  ) {}

  @Interval(60_000)
  async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.ledger.releaseMaturedFunds();
      await this.payouts.recoverStaleProcessing();
      await this.payouts.resumeBatches();
      let batchId = await this.payouts.createBatch();
      while (batchId) {
        await this.payouts.processBatch(batchId);
        batchId = await this.payouts.createBatch();
      }
    } catch (error) {
      this.logger.error(
        'Payout processing failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}
