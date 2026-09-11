import { BackgroundJobsService } from './background-jobs.service';
import { JobHandler } from './job-handler.interface';
import { JobWorkerService } from './job-worker.service';

function buildJob(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'job-1',
    type: 'some.type',
    payload: {},
    lockToken: 'lock-1',
    ...overrides,
  };
}

describe('JobWorkerService', () => {
  let backgroundJobsService: {
    claimNext: jest.Mock;
    complete: jest.Mock;
    fail: jest.Mock;
  };
  let service: JobWorkerService;

  beforeEach(() => {
    backgroundJobsService = {
      claimNext: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
    };
    service = new JobWorkerService(
      backgroundJobsService as unknown as BackgroundJobsService,
    );
  });

  it('completes the job when its registered handler succeeds', async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const handler: JobHandler = { type: 'some.type', handle };
    service.registerHandler(handler);
    backgroundJobsService.claimNext
      .mockResolvedValueOnce(buildJob())
      .mockResolvedValueOnce(null);

    await service.poll();

    expect(handle).toHaveBeenCalledWith({});
    expect(backgroundJobsService.complete).toHaveBeenCalledWith(
      'job-1',
      'lock-1',
    );
    expect(backgroundJobsService.fail).not.toHaveBeenCalled();
  });

  it('fails the job when its handler throws', async () => {
    const error = new Error('boom');
    const handler: JobHandler = {
      type: 'some.type',
      handle: jest.fn().mockRejectedValue(error),
    };
    service.registerHandler(handler);
    backgroundJobsService.claimNext
      .mockResolvedValueOnce(buildJob())
      .mockResolvedValueOnce(null);

    await service.poll();

    expect(backgroundJobsService.fail).toHaveBeenCalledWith(
      'job-1',
      'lock-1',
      error,
    );
    expect(backgroundJobsService.complete).not.toHaveBeenCalled();
  });

  it('fails the job when no handler is registered for its type', async () => {
    backgroundJobsService.claimNext
      .mockResolvedValueOnce(buildJob({ type: 'unknown.type' }))
      .mockResolvedValueOnce(null);

    await service.poll();

    expect(backgroundJobsService.fail).toHaveBeenCalledWith(
      'job-1',
      'lock-1',
      expect.objectContaining({
        message: expect.stringContaining('No handler registered') as string,
      }),
    );
  });

  it('drains every claimable job in a single poll', async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const handler: JobHandler = { type: 'some.type', handle };
    service.registerHandler(handler);
    backgroundJobsService.claimNext
      .mockResolvedValueOnce(buildJob({ id: 'job-1' }))
      .mockResolvedValueOnce(buildJob({ id: 'job-2' }))
      .mockResolvedValueOnce(null);

    await service.poll();

    expect(handle).toHaveBeenCalledTimes(2);
    expect(backgroundJobsService.claimNext).toHaveBeenCalledTimes(3);
  });

  it('does not claim again while a previous poll is still running', async () => {
    let resolveHandle!: () => void;
    const handler: JobHandler = {
      type: 'some.type',
      handle: jest.fn(
        () => new Promise<void>((resolve) => (resolveHandle = resolve)),
      ),
    };
    service.registerHandler(handler);
    backgroundJobsService.claimNext
      .mockResolvedValueOnce(buildJob())
      .mockResolvedValueOnce(null);

    const firstPoll = service.poll();
    const secondPoll = service.poll();

    // Flush microtasks so claimNext resolves and processJob reaches the
    // pending handler.handle() call before asserting/unblocking it.
    await Promise.resolve();
    await Promise.resolve();

    expect(backgroundJobsService.claimNext).toHaveBeenCalledTimes(1);

    resolveHandle();
    await Promise.all([firstPoll, secondPoll]);
  });
});
