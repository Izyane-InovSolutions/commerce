import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { OutboxEvent } from '@prisma/client';

import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxService } from './outbox.service';
import type { OutboxSubscriber } from './outbox-subscriber.interface';

function buildEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: 'event-1',
    topic: 'order.paid',
    aggregateType: 'Order',
    aggregateId: 'order-1',
    payload: { orderId: 'order-1' },
    status: 'PENDING',
    attempts: 0,
    maxAttempts: 10,
    availableAt: new Date(),
    publishedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as OutboxEvent;
}

function subscriber(
  name: string,
  topics: string[],
  handle = jest.fn().mockResolvedValue(undefined),
): OutboxSubscriber & { handle: jest.Mock } {
  return { name, topics, handle };
}

describe('OutboxDispatcherService', () => {
  let outbox: {
    claimBatch: jest.Mock;
    markPublished: jest.Mock;
    markFailed: jest.Mock;
  };
  let config: { get: jest.Mock };
  let registry: { addInterval: jest.Mock };
  let service: OutboxDispatcherService;

  beforeEach(() => {
    outbox = {
      claimBatch: jest.fn().mockResolvedValue([]),
      markPublished: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    config = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    };
    registry = { addInterval: jest.fn() };
    service = new OutboxDispatcherService(
      outbox as unknown as OutboxService,
      config as unknown as ConfigService,
      registry as unknown as SchedulerRegistry,
    );
  });

  it('hands an event to every subscriber of its topic, then publishes it', async () => {
    const first = subscriber('first', ['order.paid']);
    const second = subscriber('second', ['order.paid', 'payment.failed']);
    const other = subscriber('other', ['payment.failed']);
    [first, second, other].forEach((s) => service.registerSubscriber(s));
    const event = buildEvent();
    outbox.claimBatch.mockResolvedValueOnce([event]);

    await expect(service.dispatchPending()).resolves.toEqual({
      published: 1,
      failed: 0,
    });
    expect(first.handle).toHaveBeenCalledWith(event);
    expect(second.handle).toHaveBeenCalledWith(event);
    expect(other.handle).not.toHaveBeenCalled();
    expect(outbox.markPublished).toHaveBeenCalledWith('event-1');
  });

  it('publishes an event no subscriber listens for', async () => {
    outbox.claimBatch.mockResolvedValueOnce([buildEvent({ topic: 'x.y' })]);

    await service.dispatchPending();

    expect(outbox.markPublished).toHaveBeenCalledWith('event-1');
  });

  it('fails the whole event, naming the subscriber, when one throws', async () => {
    const failing = subscriber(
      'notifications',
      ['order.paid'],
      jest.fn().mockRejectedValue(new Error('db down')),
    );
    service.registerSubscriber(failing);
    const event = buildEvent();
    outbox.claimBatch.mockResolvedValueOnce([event]);

    await expect(service.dispatchPending()).resolves.toEqual({
      published: 0,
      failed: 1,
    });
    expect(outbox.markPublished).not.toHaveBeenCalled();
    const [[failedEvent, error]] = outbox.markFailed.mock.calls as [
      [OutboxEvent, Error],
    ];
    expect(failedEvent).toBe(event);
    expect(error.message).toBe('notifications: db down');
  });

  it('keeps claiming while batches come back full', async () => {
    config.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'OUTBOX_DISPATCH_BATCH_SIZE' ? 1 : fallback,
    );
    outbox.claimBatch
      .mockResolvedValueOnce([buildEvent({ id: 'a' })])
      .mockResolvedValueOnce([buildEvent({ id: 'b' })])
      .mockResolvedValueOnce([]);

    await expect(service.dispatchPending()).resolves.toEqual({
      published: 2,
      failed: 0,
    });
    expect(outbox.claimBatch).toHaveBeenCalledTimes(3);
  });

  it('rejects registering two subscribers under one name', () => {
    service.registerSubscriber(subscriber('notifications', ['order.paid']));

    expect(() =>
      service.registerSubscriber(subscriber('notifications', ['x.y'])),
    ).toThrow(/already registered/);
  });
});
