import { HttpException } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import {
  CHECKOUT_EXPIRED,
  checkoutExpiredConflict,
} from '../../checkout/checkout-attempt.errors';
import { OrdersService } from '../orders.service';
import {
  UnpaidOrderExpiryHandler,
  UnpaidOrderStillOwnedError,
} from './unpaid-order-expiry.handler';
import { UNPAID_ORDER_EXPIRY_JOB_TYPE } from './unpaid-order-expiry.job';

describe('UnpaidOrderExpiryHandler', () => {
  let tx: {
    checkoutAttempt: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
    };
    order: { findUnique: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let prisma: { $transaction: jest.Mock };
  let ordersService: { lockForPayment: jest.Mock; cancel: jest.Mock };
  let handler: UnpaidOrderExpiryHandler;

  /** The order as the handler re-reads it under the lock. */
  function orderIs(
    status: string,
    payment: { id: string } | null = null,
  ): void {
    tx.order.findUnique.mockResolvedValue({ status, payment });
  }

  /** A checkout attempt linked to the order, as re-read under its row lock. */
  function linkedAttempt(attempt: {
    status: string;
    leaseExpiresAt: Date | null;
  }): void {
    tx.checkoutAttempt.findUnique.mockResolvedValue({ id: 'attempt-1' });
    tx.checkoutAttempt.findUniqueOrThrow.mockResolvedValue({
      id: 'attempt-1',
      ...attempt,
    });
  }

  function callOrder(mock: jest.Mock): number {
    return mock.mock.invocationCallOrder[0] ?? Number.NaN;
  }

  beforeEach(() => {
    tx = {
      checkoutAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { findUnique: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    };
    ordersService = {
      lockForPayment: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue({ status: 'CANCELLED' }),
    };
    handler = new UnpaidOrderExpiryHandler(
      prisma as unknown as PrismaService,
      ordersService as unknown as OrdersService,
    );
  });

  it('handles the job type OrdersService enqueues', () => {
    expect(handler.type).toBe(UNPAID_ORDER_EXPIRY_JOB_TYPE);
  });

  it.each([null, 'order-1', [], {}, { orderId: 7 }])(
    'rejects a malformed payload %p',
    async (payload) => {
      await expect(handler.handle(payload)).rejects.toThrow(
        /Malformed orders\.expire_unpaid payload/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('cancels a keyless order that never got a payment, under the order lock', async () => {
    orderIs('PENDING_PAYMENT');

    await handler.handle({ orderId: 'order-1' });

    expect(ordersService.lockForPayment).toHaveBeenCalledWith('order-1', tx);
    expect(ordersService.cancel).toHaveBeenCalledWith('order-1', tx);
    expect(callOrder(ordersService.lockForPayment)).toBeLessThan(
      callOrder(tx.order.findUnique),
    );
    // No attempt: nothing to lock or record.
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.checkoutAttempt.updateMany).not.toHaveBeenCalled();
  });

  it.each(['PAID', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED'])(
    'leaves a %s order alone',
    async (status) => {
      linkedAttempt({ status: 'IN_PROGRESS', leaseExpiresAt: null });
      orderIs(status);

      await handler.handle({ orderId: 'order-1' });

      expect(ordersService.cancel).not.toHaveBeenCalled();
      expect(tx.checkoutAttempt.updateMany).not.toHaveBeenCalled();
    },
  );

  it('leaves an order with a payment row alone: submission may have happened', async () => {
    linkedAttempt({ status: 'IN_PROGRESS', leaseExpiresAt: null });
    orderIs('PENDING_PAYMENT', { id: 'payment-1' });

    await handler.handle({ orderId: 'order-1' });

    expect(ordersService.cancel).not.toHaveBeenCalled();
    expect(tx.checkoutAttempt.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing for an order that no longer exists', async () => {
    tx.order.findUnique.mockResolvedValue(null);

    await expect(handler.handle({ orderId: 'gone' })).resolves.toBeUndefined();
    expect(ordersService.cancel).not.toHaveBeenCalled();
  });

  it('retries (throws, changing nothing) while a checkout request holds a live lease on the order', async () => {
    linkedAttempt({
      status: 'IN_PROGRESS',
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    orderIs('PENDING_PAYMENT');

    await expect(handler.handle({ orderId: 'order-1' })).rejects.toBeInstanceOf(
      UnpaidOrderStillOwnedError,
    );
    expect(ordersService.cancel).not.toHaveBeenCalled();
    expect(tx.checkoutAttempt.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['a released attempt (no lease)', null],
    ['a lapsed lease', new Date(Date.now() - 1_000)],
  ])(
    'cancels the order and records CHECKOUT_EXPIRED for %s',
    async (_case, leaseExpiresAt) => {
      linkedAttempt({ status: 'IN_PROGRESS', leaseExpiresAt });
      orderIs('PENDING_PAYMENT');

      await handler.handle({ orderId: 'order-1' });

      expect(ordersService.cancel).toHaveBeenCalledWith('order-1', tx);
      const [{ where, data }] = tx.checkoutAttempt.updateMany.mock.calls[0] as [
        { where: Record<string, unknown>; data: Record<string, unknown> },
      ];
      expect(where).toEqual({
        id: 'attempt-1',
        status: 'IN_PROGRESS',
        OR: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lte: expect.any(Date) as unknown } },
        ],
      });
      const expected = checkoutExpiredConflict('order-1');
      expect(data).toEqual({
        status: 'REJECTED',
        stage: 'FINISHED',
        response: expected.getResponse(),
        errorStatus: 409,
        completedAt: expect.any(Date) as unknown,
        ownerToken: null,
        leaseExpiresAt: null,
      });
      // The recorded body is the one a retry's own expiry would record.
      const replay = new HttpException(
        data.response as Record<string, unknown>,
        data.errorStatus as number,
      );
      expect(
        (
          replay.getResponse() as {
            details: { field: string; message: string }[];
          }
        ).details,
      ).toEqual([
        { field: 'code', message: CHECKOUT_EXPIRED },
        { field: 'orderId', message: 'order-1' },
      ]);
      expect(callOrder(ordersService.cancel)).toBeLessThan(
        callOrder(tx.checkoutAttempt.updateMany),
      );
    },
  );

  it('locks the attempt row before the order row (checkout_attempts → orders)', async () => {
    linkedAttempt({ status: 'IN_PROGRESS', leaseExpiresAt: null });
    orderIs('PENDING_PAYMENT');

    await handler.handle({ orderId: 'order-1' });

    expect(tx.checkoutAttempt.findUnique).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      select: { id: true },
    });
    const [sql] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(sql.join('?')).toMatch(/FROM checkout_attempts .*FOR UPDATE/);
    expect(callOrder(tx.$queryRaw)).toBeLessThan(
      callOrder(ordersService.lockForPayment),
    );
    // The attempt is re-read only once its row is locked.
    expect(callOrder(tx.$queryRaw)).toBeLessThan(
      callOrder(tx.checkoutAttempt.findUniqueOrThrow),
    );
  });

  it.each(['REJECTED', 'COMPLETED', 'BLOCKED'])(
    'cancels the order but leaves a %s attempt as recorded',
    async (status) => {
      linkedAttempt({ status, leaseExpiresAt: null });
      orderIs('PENDING_PAYMENT');

      await handler.handle({ orderId: 'order-1' });

      expect(ordersService.cancel).toHaveBeenCalledWith('order-1', tx);
      expect(tx.checkoutAttempt.updateMany).not.toHaveBeenCalled();
    },
  );

  it('propagates a cancel failure so the job retries, recording nothing', async () => {
    linkedAttempt({ status: 'IN_PROGRESS', leaseExpiresAt: null });
    orderIs('PENDING_PAYMENT');
    ordersService.cancel.mockRejectedValue(new Error('deadlock detected'));

    await expect(handler.handle({ orderId: 'order-1' })).rejects.toThrow(
      'deadlock detected',
    );
    expect(tx.checkoutAttempt.updateMany).not.toHaveBeenCalled();
  });
});
