import { LedgerService } from '../ledger.service';
import { PayoutProcessingService } from './payout-processing.service';
import { PayoutsService } from './payouts.service';

describe('payout worker recovery order', () => {
  it('recovers uncertain attempts and resumes assigned work before claiming new work', async () => {
    const ledger = { releaseMaturedFunds: jest.fn().mockResolvedValue(0) };
    const payouts = {
      recoverStaleProcessing: jest.fn().mockResolvedValue(0),
      resumeBatches: jest.fn().mockResolvedValue(undefined),
      createBatch: jest
        .fn()
        .mockResolvedValueOnce('batch')
        .mockResolvedValue(null),
      processBatch: jest.fn().mockResolvedValue(undefined),
    };
    await new PayoutProcessingService(
      payouts as unknown as PayoutsService,
      ledger as unknown as LedgerService,
    ).poll();
    expect(
      payouts.recoverStaleProcessing.mock.invocationCallOrder[0],
    ).toBeLessThan(payouts.resumeBatches.mock.invocationCallOrder[0]!);
    expect(payouts.resumeBatches.mock.invocationCallOrder[0]).toBeLessThan(
      payouts.createBatch.mock.invocationCallOrder[0]!,
    );
    expect(payouts.processBatch).toHaveBeenCalledWith('batch');
  });
});
