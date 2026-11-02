import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import {
  CHECKOUT_ATTEMPT_LEASE_MS,
  CHECKOUT_EXPIRED,
  CHECKOUT_IN_PROGRESS,
  CHECKOUT_KEY_LEGACY_RECEIPT,
  CHECKOUT_KEY_REUSED,
  CHECKOUT_PAYMENT_FAILED,
  CHECKOUT_REQUIRES_RECONCILIATION,
  CheckoutAttemptSupersededError,
} from './checkout-attempt.errors';
import {
  CHECKOUT_RESUME_MIN_RESERVATION_MS,
  CheckoutAttemptsService,
} from './checkout-attempts.service';
import {
  CheckoutFingerprintService,
  normalizeBuyNowCheckout,
  normalizeCartCheckout,
  type NormalizedCheckoutRequest,
} from './checkout-fingerprint';
import type { CheckoutResult } from './checkout.types';

const KEY = {
  key: '9b2f4c8e-1d3a-4f5b-9c7d-2e8f6a1b3c4d',
  rawKey: '9B2F4C8E-1D3A-4F5B-9C7D-2E8F6A1B3C4D',
};
const REQUEST = normalizeCartCheckout({
  shippingAddressId: 'addr-1',
  currency: 'ZMW',
});
const RESULT = {
  order: { id: 'order-1' },
  payment: { id: 'payment-1', status: 'PENDING' },
} as unknown as CheckoutResult;

/** The `code` detail the global filter will render. */
function codeOf(error: unknown): string | undefined {
  const body = (error as HttpException).getResponse() as {
    details?: { field: string; message: string }[];
  };
  return body.details?.find((detail) => detail.field === 'code')?.message;
}

/** Every `details` entry the global filter will render. */
function detailsOf(error: unknown): { field: string; message: string }[] {
  const body = (error as HttpException).getResponse() as {
    details?: { field: string; message: string }[];
  };
  return body.details ?? [];
}

function firstCallArgument(mock: jest.Mock): unknown {
  return (mock.mock.calls as unknown[][])[0]?.[0];
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected a rejection');
}

describe('CheckoutAttemptsService', () => {
  let prisma: {
    checkoutAttempt: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    order: { findUnique: jest.Mock };
    reservation: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let ordersService: { findForCheckout: jest.Mock; cancel: jest.Mock };
  let paymentsService: { findForOrder: jest.Mock };
  let fingerprints: CheckoutFingerprintService;
  let service: CheckoutAttemptsService;
  let execute: jest.Mock;

  /** A stored attempt as a matching retry would find it. */
  function attempt(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const fingerprint = fingerprints.compute(REQUEST);
    return {
      id: 'attempt-1',
      userId: 'user-1',
      key: KEY.key,
      operation: 'cart',
      fingerprint: fingerprint.fingerprint,
      fingerprintKeyId: fingerprint.keyId,
      fingerprintVersion: fingerprint.version,
      status: 'IN_PROGRESS',
      stage: 'RECEIVED',
      ownerToken: 'old-owner',
      leaseExpiresAt: new Date(Date.now() - 1_000),
      orderId: null,
      response: null,
      errorStatus: null,
      completedAt: null,
      ...overrides,
    };
  }

  function run(
    request: NormalizedCheckoutRequest = REQUEST,
  ): Promise<CheckoutResult> {
    return service.run(
      'user-1',
      KEY,
      request,
      execute as (ctx: unknown) => Promise<CheckoutResult>,
    );
  }

  /** The data of the updateMany whose where clause matched `status`. */
  function writesWithStatus(status: string): unknown[] {
    return prisma.checkoutAttempt.updateMany.mock.calls
      .map(([args]) => args as { data: { status?: string } })
      .filter((args) => args.data.status === status);
  }

  beforeEach(() => {
    prisma = {
      checkoutAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(({ data }: { data: object }) =>
          Promise.resolve({ id: 'attempt-1', ...data }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({ status: 'PENDING_PAYMENT' }),
      },
      reservation: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    ordersService = { findForCheckout: jest.fn(), cancel: jest.fn() };
    paymentsService = { findForOrder: jest.fn().mockResolvedValue(null) };
    const env: Record<string, string> = {
      CHECKOUT_FINGERPRINT_ACTIVE_KEY_ID: 'v1',
      CHECKOUT_FINGERPRINT_KEYS: JSON.stringify({
        v1: Buffer.alloc(32, 5).toString('base64'),
      }),
    };
    fingerprints = new CheckoutFingerprintService({
      getOrThrow: (name: string) => env[name],
    } as unknown as ConfigService);
    service = new CheckoutAttemptsService(
      prisma as unknown as PrismaService,
      fingerprints,
      ordersService as unknown as OrdersService,
      paymentsService as unknown as PaymentsService,
    );
    execute = jest.fn().mockResolvedValue(RESULT);
  });

  it('runs a keyless request without any receipt', async () => {
    await expect(
      service.run('user-1', undefined, REQUEST, execute),
    ).resolves.toBe(RESULT);

    expect(execute).toHaveBeenCalledWith(null);
    expect(prisma.checkoutAttempt.findUnique).not.toHaveBeenCalled();
  });

  describe('a new key', () => {
    it('claims an attempt with a lease and keyed fingerprint metadata', async () => {
      await run();

      const { data } = firstCallArgument(prisma.checkoutAttempt.create) as {
        data: Record<string, unknown>;
      };
      expect(data).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          key: KEY.key,
          operation: 'cart',
          fingerprint: fingerprints.compute(REQUEST).fingerprint,
          fingerprintKeyId: 'v1',
          fingerprintVersion: 1,
          status: 'IN_PROGRESS',
          stage: 'RECEIVED',
        }),
      );
      expect(data.leaseExpiresAt).toBeInstanceOf(Date);
      expect(execute).toHaveBeenCalledWith({
        attemptId: 'attempt-1',
        ownerToken: data.ownerToken,
      });
    });

    it('refuses a key an order used before receipts existed, in either letter case', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'legacy-order' }]);

      const error = await rejectionOf(run());

      expect(codeOf(error)).toBe(CHECKOUT_KEY_LEGACY_RECEIPT);
      expect(prisma.checkoutAttempt.create).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    });

    it('answers in progress when a concurrent request won the insert', async () => {
      prisma.checkoutAttempt.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      prisma.checkoutAttempt.findUniqueOrThrow.mockResolvedValue(
        attempt({ leaseExpiresAt: new Date(Date.now() + 60_000) }),
      );

      expect(codeOf(await rejectionOf(run()))).toBe(CHECKOUT_IN_PROGRESS);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('an existing key', () => {
    it('replays a completed result without executing again', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ status: 'COMPLETED', response: RESULT, orderId: 'order-1' }),
      );

      await expect(run()).resolves.toEqual(RESULT);
      expect(execute).not.toHaveBeenCalled();
    });

    it('replays a recorded rejection with its original status', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({
          status: 'REJECTED',
          response: { statusCode: 409, message: 'Cart is empty' },
          errorStatus: 409,
        }),
      );

      const error = await rejectionOf(run());

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toEqual({
        statusCode: 409,
        message: 'Cart is empty',
      });
    });

    it.each([
      ['different request details', { ...REQUEST, currency: 'USD' }],
      [
        'a different operation',
        normalizeBuyNowCheckout({
          offerId: 'offer-1',
          quantity: 1,
          shippingAddressId: 'addr-1',
          currency: 'ZMW',
        }),
      ],
    ])('rejects reuse for %s', async (_case, request) => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ status: 'COMPLETED', response: RESULT }),
      );

      expect(codeOf(await rejectionOf(run(request)))).toBe(CHECKOUT_KEY_REUSED);
      expect(execute).not.toHaveBeenCalled();
    });

    it('never replays or resubmits a legacy receipt it cannot compare', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({
          fingerprint: 'a'.repeat(64),
          fingerprintKeyId: null,
          fingerprintVersion: null,
          status: 'COMPLETED',
          response: RESULT,
          orderId: 'order-1',
        }),
      );

      const error = await rejectionOf(run());

      expect(codeOf(error)).toBe(CHECKOUT_KEY_LEGACY_RECEIPT);
      expect(execute).not.toHaveBeenCalled();
    });

    it('points a blocked attempt at its order and payment', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ status: 'BLOCKED', orderId: 'order-1' }),
      );
      paymentsService.findForOrder.mockResolvedValue({ id: 'payment-1' });

      const error = await rejectionOf(run());

      expect(codeOf(error)).toBe(CHECKOUT_REQUIRES_RECONCILIATION);
      expect((error as HttpException).getResponse()).toEqual(
        expect.objectContaining({
          details: [
            { field: 'code', message: CHECKOUT_REQUIRES_RECONCILIATION },
            { field: 'orderId', message: 'order-1' },
            { field: 'paymentId', message: 'payment-1' },
          ],
        }),
      );
    });

    it('waits for an owner whose lease is still live', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ leaseExpiresAt: new Date(Date.now() + 60_000) }),
      );

      expect(codeOf(await rejectionOf(run()))).toBe(CHECKOUT_IN_PROGRESS);
      expect(prisma.checkoutAttempt.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('a lapsed lease', () => {
    it('blocks the key once a payment row exists, since submission may have happened', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ orderId: 'order-1', stage: 'PAYMENT_STARTED' }),
      );
      paymentsService.findForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
      });

      const error = await rejectionOf(run());

      expect(codeOf(error)).toBe(CHECKOUT_REQUIRES_RECONCILIATION);
      expect(prisma.checkoutAttempt.updateMany).toHaveBeenCalledWith({
        where: { id: 'attempt-1', status: 'IN_PROGRESS' },
        data: { status: 'BLOCKED', ownerToken: null, leaseExpiresAt: null },
      });
      expect(execute).not.toHaveBeenCalled();
    });

    it('takes the attempt over with a compare-and-set on the owner it read', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(attempt());
      prisma.checkoutAttempt.findUniqueOrThrow.mockResolvedValue({
        orderId: null,
      });

      await run();

      const claim = firstCallArgument(prisma.checkoutAttempt.updateMany) as {
        where: Record<string, unknown>;
        data: { ownerToken: string };
      };
      expect(claim.where).toEqual(
        expect.objectContaining({
          id: 'attempt-1',
          status: 'IN_PROGRESS',
          ownerToken: 'old-owner',
        }),
      );
      expect(claim.data.ownerToken).not.toBe('old-owner');
      expect(execute).toHaveBeenCalledWith({
        attemptId: 'attempt-1',
        ownerToken: claim.data.ownerToken,
      });
    });

    it('answers in progress when another retry claimed it first', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(attempt());
      prisma.checkoutAttempt.updateMany.mockResolvedValue({ count: 0 });

      expect(codeOf(await rejectionOf(run()))).toBe(CHECKOUT_IN_PROGRESS);
      expect(execute).not.toHaveBeenCalled();
    });

    it('resumes an order that still holds all its reservations', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ orderId: 'order-1', stage: 'ORDER_CREATED' }),
      );
      prisma.checkoutAttempt.findUniqueOrThrow.mockResolvedValue({
        orderId: 'order-1',
      });
      ordersService.findForCheckout.mockResolvedValue({
        id: 'order-1',
        status: 'PENDING_PAYMENT',
        items: [{ reservationId: 'r-1' }, { reservationId: 'r-2' }],
      });
      prisma.reservation.findMany.mockResolvedValue([
        { status: 'ACTIVE', expiresAt: new Date(Date.now() + 10 * 60_000) },
        { status: 'ACTIVE', expiresAt: new Date(Date.now() + 10 * 60_000) },
      ]);

      await run();

      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ resumeOrderId: 'order-1' }),
      );
      expect(ordersService.cancel).not.toHaveBeenCalled();
    });

    it.each([
      ['barely unexpired', CHECKOUT_RESUME_MIN_RESERVATION_MS - 5_000],
      ['exactly at the minimum', CHECKOUT_RESUME_MIN_RESERVATION_MS - 1],
    ])(
      'gives up rather than resumes when a reservation is %s (too little lifetime left to pay)',
      async (_case, remainingMs) => {
        prisma.checkoutAttempt.findUnique.mockResolvedValue(
          attempt({ orderId: 'order-1', stage: 'ORDER_CREATED' }),
        );
        prisma.checkoutAttempt.findUniqueOrThrow.mockResolvedValue({
          orderId: 'order-1',
        });
        ordersService.findForCheckout.mockResolvedValue({
          id: 'order-1',
          status: 'PENDING_PAYMENT',
          items: [{ reservationId: 'r-1' }, { reservationId: 'r-2' }],
        });
        prisma.reservation.findMany.mockResolvedValue([
          { status: 'ACTIVE', expiresAt: new Date(Date.now() + 10 * 60_000) },
          { status: 'ACTIVE', expiresAt: new Date(Date.now() + remainingMs) },
        ]);

        const error = await rejectionOf(run());

        expect(codeOf(error)).toBe(CHECKOUT_EXPIRED);
        expect(detailsOf(error)).toContainEqual({
          field: 'orderId',
          message: 'order-1',
        });
        expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
        expect(writesWithStatus('REJECTED')).toEqual([
          expect.objectContaining({
            data: expect.objectContaining({ errorStatus: 409 }) as unknown,
          }),
        ]);
        expect(execute).not.toHaveBeenCalled();
      },
    );

    it('resumes when every reservation has more than the minimum lifetime left', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ orderId: 'order-1', stage: 'ORDER_CREATED' }),
      );
      prisma.checkoutAttempt.findUniqueOrThrow.mockResolvedValue({
        orderId: 'order-1',
      });
      ordersService.findForCheckout.mockResolvedValue({
        id: 'order-1',
        status: 'PENDING_PAYMENT',
        items: [{ reservationId: 'r-1' }],
      });
      prisma.reservation.findMany.mockResolvedValue([
        {
          status: 'ACTIVE',
          expiresAt: new Date(
            Date.now() + CHECKOUT_RESUME_MIN_RESERVATION_MS + 30_000,
          ),
        },
      ]);

      await run();

      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ resumeOrderId: 'order-1' }),
      );
      expect(ordersService.cancel).not.toHaveBeenCalled();
    });

    it('cancels an order whose reservations lapsed and records the key as expired', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ orderId: 'order-1', stage: 'ORDER_CREATED' }),
      );
      prisma.checkoutAttempt.findUniqueOrThrow.mockResolvedValue({
        orderId: 'order-1',
      });
      ordersService.findForCheckout.mockResolvedValue({
        id: 'order-1',
        status: 'PENDING_PAYMENT',
        items: [{ reservationId: 'r-1' }],
      });
      prisma.reservation.findMany.mockResolvedValue([
        { status: 'EXPIRED', expiresAt: new Date(Date.now() - 60_000) },
      ]);

      const error = await rejectionOf(run());

      expect(codeOf(error)).toBe(CHECKOUT_EXPIRED);
      expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
      expect(writesWithStatus('REJECTED')).toEqual([
        expect.objectContaining({
          data: expect.objectContaining({ errorStatus: 409 }) as unknown,
        }),
      ]);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('a failed execution', () => {
    /** The attempt as its own (still current) owner re-reads it. */
    function ownAttempt(orderId: string | null): () => Promise<unknown> {
      return () => {
        const { data } = firstCallArgument(prisma.checkoutAttempt.create) as {
          data: { ownerToken: string };
        };
        return Promise.resolve({
          orderId,
          status: 'IN_PROGRESS',
          ownerToken: data.ownerToken,
        });
      };
    }

    beforeEach(() => {
      prisma.checkoutAttempt.findUnique
        .mockResolvedValueOnce(null)
        .mockImplementation(ownAttempt(null));
    });

    it('records a definite refusal before any order as the final answer', async () => {
      execute.mockRejectedValue(new BadRequestException('No items selected'));

      await expect(run()).rejects.toThrow('No items selected');

      expect(writesWithStatus('REJECTED')).toEqual([
        expect.objectContaining({
          data: expect.objectContaining({
            errorStatus: 400,
            response: expect.objectContaining({
              message: 'No items selected',
            }) as unknown,
          }) as unknown,
        }),
      ]);
    });

    it('releases the attempt after a transient error so the next retry resumes at once', async () => {
      execute.mockRejectedValue(new Error('connection reset'));

      await expect(run()).rejects.toThrow('connection reset');

      expect(writesWithStatus('REJECTED')).toEqual([]);
      expect(prisma.checkoutAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { ownerToken: null, leaseExpiresAt: null },
        }),
      );
    });

    it('records what the global filter would render when a failed payment ends in a non-HTTP error', async () => {
      prisma.checkoutAttempt.findUnique
        .mockReset()
        .mockResolvedValueOnce(null)
        .mockImplementation(ownAttempt('order-1'));
      paymentsService.findForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'FAILED',
      });
      execute.mockRejectedValue(new Error('socket hang up'));

      await expect(run()).rejects.toThrow('socket hang up');

      expect(writesWithStatus('REJECTED')).toEqual([
        expect.objectContaining({
          data: expect.objectContaining({
            errorStatus: 500,
            response: {
              statusCode: 500,
              message: 'An unexpected error occurred',
            },
          }) as unknown,
        }),
      ]);
    });

    it('blocks the key when a payment exists whose outcome is unknown', async () => {
      prisma.checkoutAttempt.findUnique
        .mockReset()
        .mockResolvedValueOnce(null)
        .mockImplementation(ownAttempt('order-1'));
      paymentsService.findForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'PROCESSING',
      });
      execute.mockRejectedValue(new ServiceUnavailableException());

      await expect(run()).rejects.toThrow(ServiceUnavailableException);

      expect(writesWithStatus('BLOCKED')).toHaveLength(1);
      expect(writesWithStatus('REJECTED')).toEqual([]);
    });

    it('writes nothing when the attempt was taken over', async () => {
      execute.mockRejectedValue(new CheckoutAttemptSupersededError());

      expect(codeOf(await rejectionOf(run()))).toBe(CHECKOUT_IN_PROGRESS);
      expect(prisma.checkoutAttempt.updateMany).not.toHaveBeenCalled();
    });

    it('rethrows the original error when recording the outcome fails', async () => {
      const original = new Error('connection reset');
      execute.mockRejectedValue(original);
      prisma.checkoutAttempt.updateMany.mockRejectedValue(
        new Error('database down'),
      );

      await expect(run()).rejects.toBe(original);
    });
  });

  describe('complete', () => {
    it('records the response on the linked order, never the internal cart snapshot', async () => {
      await service.complete(
        { attemptId: 'attempt-1', ownerToken: 'owner' },
        'order-1',
        {
          ...RESULT,
          order: { id: 'order-1', checkoutCartSnapshot: [{ id: 'line' }] },
        } as unknown as CheckoutResult,
      );

      expect(prisma.checkoutAttempt.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'attempt-1',
          orderId: 'order-1',
          status: { in: ['IN_PROGRESS', 'BLOCKED'] },
        },
        data: expect.objectContaining({
          status: 'COMPLETED',
          stage: 'FINISHED',
          response: { order: { id: 'order-1' }, payment: RESULT.payment },
          ownerToken: null,
          leaseExpiresAt: null,
        }) as unknown,
      });
    });
  });

  describe('markPaymentStarted', () => {
    it('refuses to start payment for a request that lost its attempt', async () => {
      prisma.checkoutAttempt.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.markPaymentStarted(
          { attemptId: 'attempt-1', ownerToken: 'o' },
          'order-1',
        ),
      ).rejects.toBeInstanceOf(CheckoutAttemptSupersededError);
    });

    it('is fenced on owner, status and linked order, renews the lease and runs on the given transaction', async () => {
      const tx = {
        checkoutAttempt: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const before = Date.now();

      await service.markPaymentStarted(
        { attemptId: 'attempt-1', ownerToken: 'owner-1' },
        'order-1',
        tx as never,
      );

      expect(prisma.checkoutAttempt.updateMany).not.toHaveBeenCalled();
      const { where, data } = firstCallArgument(
        tx.checkoutAttempt.updateMany,
      ) as {
        where: Record<string, unknown>;
        data: { stage: string; leaseExpiresAt: Date };
      };
      expect(where).toEqual({
        id: 'attempt-1',
        ownerToken: 'owner-1',
        status: 'IN_PROGRESS',
        orderId: 'order-1',
      });
      expect(data.stage).toBe('PAYMENT_STARTED');
      expect(data.leaseExpiresAt.getTime()).toBeGreaterThanOrEqual(
        before + CHECKOUT_ATTEMPT_LEASE_MS,
      );
    });
  });

  describe('complete on a finished attempt', () => {
    it('only logs when the attempt was already finished', async () => {
      prisma.checkoutAttempt.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.complete(
          { attemptId: 'attempt-1', ownerToken: 'owner' },
          'order-1',
          RESULT,
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('legacy receipts and key case', () => {
    it('looks the attempt up and records it under the lowercased key only', async () => {
      await run();

      expect(prisma.checkoutAttempt.findUnique).toHaveBeenCalledWith({
        where: { userId_key: { userId: 'user-1', key: KEY.key } },
      });
      expect(
        (
          firstCallArgument(prisma.checkoutAttempt.create) as {
            data: { key: string };
          }
        ).data.key,
      ).toBe(KEY.key);
      // The header as sent is never used to find or store anything.
      expect(
        JSON.stringify([
          prisma.checkoutAttempt.findUnique.mock.calls,
          prisma.checkoutAttempt.create.mock.calls,
          prisma.$queryRaw.mock.calls,
        ]),
      ).not.toContain(KEY.rawKey);
    });

    it('matches legacy drafts and orders case-insensitively, scoped to the user', async () => {
      await run();

      const [draft, order] = (
        prisma.$queryRaw.mock.calls as [TemplateStringsArray, ...unknown[]][]
      ).map(([strings, ...values]) => ({ sql: strings.join('?'), values }));
      expect(draft?.sql).toMatch(/FROM checkout_attempts/);
      expect(draft?.sql).toMatch(/user_id = \?::uuid/);
      expect(draft?.sql).toMatch(/lower\(key\) = \? AND key <> \?/);
      expect(draft?.values).toEqual(['user-1', KEY.key, KEY.key]);
      expect(order?.sql).toMatch(/FROM orders/);
      expect(order?.sql).toMatch(/user_id = \?::uuid/);
      expect(order?.sql).toMatch(/lower\(idempotency_key\) = \?/);
      expect(order?.values).toEqual(['user-1', KEY.key]);
    });

    it('refuses a key a draft attempt stored in another letter case, pointing at its order', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ order_id: 'draft-order' }]);

      const error = await rejectionOf(run());

      expect(codeOf(error)).toBe(CHECKOUT_KEY_LEGACY_RECEIPT);
      expect(detailsOf(error)).toContainEqual({
        field: 'orderId',
        message: 'draft-order',
      });
      // The draft alone answers; no order lookup, nothing created or run.
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.checkoutAttempt.create).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    });

    it('refuses a draft attempt in another case that never linked an order', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ order_id: null }]);

      const error = await rejectionOf(run());

      expect(codeOf(error)).toBe(CHECKOUT_KEY_LEGACY_RECEIPT);
      expect(detailsOf(error)).toEqual([
        { field: 'code', message: CHECKOUT_KEY_LEGACY_RECEIPT },
      ]);
      expect(execute).not.toHaveBeenCalled();
    });

    it('names the legacy order a key was used for', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'legacy-order' }]);

      expect(detailsOf(await rejectionOf(run()))).toContainEqual({
        field: 'orderId',
        message: 'legacy-order',
      });
    });

    it('never looks for legacy receipts once an attempt exists for the key', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ status: 'COMPLETED', response: RESULT, orderId: 'order-1' }),
      );

      await run();

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it.each([
      ['COMPLETED', { response: RESULT }],
      ['REJECTED', { response: { message: 'x' }, errorStatus: 409 }],
      ['BLOCKED', {}],
      ['IN_PROGRESS', { leaseExpiresAt: null, ownerToken: null }],
    ])(
      'never replays, resumes or rewrites an incomparable %s receipt',
      async (status, extra) => {
        for (const metadata of [
          { fingerprintKeyId: 'retired', fingerprintVersion: 1 },
          { fingerprintKeyId: 'v1', fingerprintVersion: 2 },
          { fingerprintKeyId: null, fingerprintVersion: 1 },
          { fingerprintKeyId: 'v1', fingerprintVersion: null },
        ]) {
          prisma.checkoutAttempt.findUnique.mockResolvedValue(
            attempt({ status, orderId: 'order-1', ...extra, ...metadata }),
          );

          const error = await rejectionOf(run());

          expect(codeOf(error)).toBe(CHECKOUT_KEY_LEGACY_RECEIPT);
          expect(detailsOf(error)).toContainEqual({
            field: 'orderId',
            message: 'order-1',
          });
        }
        expect(execute).not.toHaveBeenCalled();
        expect(prisma.checkoutAttempt.updateMany).not.toHaveBeenCalled();
        expect(paymentsService.findForOrder).not.toHaveBeenCalled();
        expect(ordersService.cancel).not.toHaveBeenCalled();
      },
    );

    it('answers key reuse for another operation even on an incomparable receipt', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ operation: 'buy-now', fingerprintKeyId: null }),
      );

      expect(codeOf(await rejectionOf(run()))).toBe(CHECKOUT_KEY_REUSED);
    });
  });

  describe('a payment that was refused', () => {
    const FAILED = { id: 'payment-1', status: 'FAILED' };

    function refusedWrite(): {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    } {
      return writesWithStatus('REJECTED')[0] as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      };
    }

    it.each([
      ['a blocked attempt', { status: 'BLOCKED', ownerToken: null }],
      ['an attempt whose owner died', { status: 'IN_PROGRESS' }],
    ])(
      'turns %s into a final CHECKOUT_PAYMENT_FAILED once its order is cancelled',
      async (_case, state) => {
        prisma.checkoutAttempt.findUnique.mockResolvedValue(
          attempt({ ...state, orderId: 'order-1', stage: 'PAYMENT_STARTED' }),
        );
        paymentsService.findForOrder.mockResolvedValue(FAILED);
        prisma.order.findUnique.mockResolvedValue({ status: 'CANCELLED' });

        const error = await rejectionOf(run());

        expect(codeOf(error)).toBe(CHECKOUT_PAYMENT_FAILED);
        expect((error as HttpException).getStatus()).toBe(409);
        expect(detailsOf(error)).toEqual([
          { field: 'code', message: CHECKOUT_PAYMENT_FAILED },
          { field: 'orderId', message: 'order-1' },
          { field: 'paymentId', message: 'payment-1' },
        ]);
        const { where, data } = refusedWrite();
        expect(where).toEqual({
          id: 'attempt-1',
          status: { in: ['IN_PROGRESS', 'BLOCKED'] },
        });
        expect(data).toEqual(
          expect.objectContaining({
            stage: 'FINISHED',
            errorStatus: 409,
            response: (error as HttpException).getResponse(),
            ownerToken: null,
            leaseExpiresAt: null,
            completedAt: expect.any(Date) as unknown,
          }),
        );
        expect(writesWithStatus('BLOCKED')).toEqual([]);
        expect(ordersService.cancel).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
      },
    );

    it('cancels the order a refused payment left pending before rejecting the key', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ status: 'BLOCKED', orderId: 'order-1' }),
      );
      paymentsService.findForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'CANCELLED',
      });
      prisma.order.findUnique.mockResolvedValue({ status: 'PENDING_PAYMENT' });
      ordersService.cancel.mockResolvedValue({ status: 'CANCELLED' });

      expect(codeOf(await rejectionOf(run()))).toBe(CHECKOUT_PAYMENT_FAILED);
      expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
      expect(writesWithStatus('REJECTED')).toHaveLength(1);
    });

    it('keeps the key blocked when the refused payment order cannot be cancelled', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ status: 'BLOCKED', orderId: 'order-1' }),
      );
      paymentsService.findForOrder.mockResolvedValue(FAILED);
      prisma.order.findUnique.mockResolvedValue({ status: 'PAID' });

      expect(codeOf(await rejectionOf(run()))).toBe(
        CHECKOUT_REQUIRES_RECONCILIATION,
      );
      expect(writesWithStatus('REJECTED')).toEqual([]);
      expect(ordersService.cancel).not.toHaveBeenCalled();
    });

    it('replays the recorded payment failure on every later retry', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ status: 'BLOCKED', orderId: 'order-1' }),
      );
      paymentsService.findForOrder.mockResolvedValue(FAILED);
      prisma.order.findUnique.mockResolvedValue({ status: 'CANCELLED' });
      const first = await rejectionOf(run());
      const { data } = refusedWrite();

      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({
          status: 'REJECTED',
          orderId: 'order-1',
          response: data.response,
          errorStatus: data.errorStatus,
        }),
      );
      paymentsService.findForOrder.mockClear();
      const replayed = await rejectionOf(run());

      expect((replayed as HttpException).getStatus()).toBe(409);
      expect((replayed as HttpException).getResponse()).toEqual(
        (first as HttpException).getResponse(),
      );
      expect(paymentsService.findForOrder).not.toHaveBeenCalled();
    });

    it('answers with the outcome a concurrent request recorded first', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ status: 'BLOCKED', orderId: 'order-1' }),
      );
      paymentsService.findForOrder.mockResolvedValue(FAILED);
      prisma.order.findUnique.mockResolvedValue({ status: 'CANCELLED' });
      prisma.checkoutAttempt.updateMany.mockResolvedValue({ count: 0 });
      prisma.checkoutAttempt.findUniqueOrThrow.mockResolvedValue(
        attempt({ status: 'COMPLETED', orderId: 'order-1', response: RESULT }),
      );

      await expect(run()).resolves.toEqual(RESULT);
      expect(execute).not.toHaveBeenCalled();
    });

    it('points a blocked attempt without an order at reconciliation', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ status: 'BLOCKED', orderId: null }),
      );

      expect(codeOf(await rejectionOf(run()))).toBe(
        CHECKOUT_REQUIRES_RECONCILIATION,
      );
      expect(prisma.checkoutAttempt.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('taking over a lapsed attempt', () => {
    /** The owner token the claim wrote. */
    function claimedToken(): string {
      const claim = prisma.checkoutAttempt.updateMany.mock.calls
        .map(([args]) => args as { data: { ownerToken?: unknown } })
        .find((args) => typeof args.data.ownerToken === 'string');
      return claim?.data.ownerToken as string;
    }

    it('claims only while the lease is still lapsed, renewing it for the new owner', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(attempt());
      prisma.checkoutAttempt.findUniqueOrThrow.mockResolvedValue({
        orderId: null,
      });
      const before = Date.now();

      await run();

      const claim = firstCallArgument(prisma.checkoutAttempt.updateMany) as {
        where: { OR: { leaseExpiresAt: unknown }[] };
        data: { leaseExpiresAt: Date };
      };
      expect(claim.where.OR).toEqual([
        { leaseExpiresAt: null },
        { leaseExpiresAt: { lte: expect.any(Date) as unknown } },
      ]);
      expect(claim.data.leaseExpiresAt.getTime()).toBeGreaterThanOrEqual(
        before + CHECKOUT_ATTEMPT_LEASE_MS,
      );
    });

    it('claims a released attempt (no owner, no lease) at once', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ ownerToken: null, leaseExpiresAt: null }),
      );
      prisma.checkoutAttempt.findUniqueOrThrow.mockResolvedValue({
        orderId: null,
      });

      await run();

      expect(
        (
          firstCallArgument(prisma.checkoutAttempt.updateMany) as {
            where: Record<string, unknown>;
          }
        ).where,
      ).toEqual(expect.objectContaining({ ownerToken: null }));
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('names the order and payment of a live owner it waits for', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({
          orderId: 'order-1',
          leaseExpiresAt: new Date(Date.now() + 60_000),
        }),
      );
      paymentsService.findForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
      });

      const error = await rejectionOf(run());

      expect(codeOf(error)).toBe(CHECKOUT_IN_PROGRESS);
      expect(detailsOf(error)).toEqual([
        { field: 'code', message: CHECKOUT_IN_PROGRESS },
        { field: 'orderId', message: 'order-1' },
        { field: 'paymentId', message: 'payment-1' },
      ]);
      expect(prisma.checkoutAttempt.updateMany).not.toHaveBeenCalled();
    });

    it('resumes an order the previous owner linked after the first read', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(attempt());
      prisma.checkoutAttempt.findUniqueOrThrow.mockResolvedValue({
        orderId: 'order-late',
      });
      ordersService.findForCheckout.mockResolvedValue({
        id: 'order-late',
        status: 'PENDING_PAYMENT',
        items: [{ reservationId: 'r-1' }],
      });
      prisma.reservation.findMany.mockResolvedValue([
        { status: 'ACTIVE', expiresAt: new Date(Date.now() + 10 * 60_000) },
      ]);

      await run();

      expect(paymentsService.findForOrder).toHaveBeenCalledWith('order-late');
      expect(execute).toHaveBeenCalledWith({
        attemptId: 'attempt-1',
        ownerToken: claimedToken(),
        resumeOrderId: 'order-late',
      });
    });

    it('blocks instead of resuming when a payment row appeared after the claim', async () => {
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ orderId: 'order-1' }),
      );
      prisma.checkoutAttempt.findUniqueOrThrow.mockResolvedValue({
        orderId: 'order-1',
      });
      paymentsService.findForOrder
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 'payment-1', status: 'PENDING' });

      expect(codeOf(await rejectionOf(run()))).toBe(
        CHECKOUT_REQUIRES_RECONCILIATION,
      );
      expect(writesWithStatus('BLOCKED')).toEqual([
        {
          where: { id: 'attempt-1', status: 'IN_PROGRESS' },
          data: { status: 'BLOCKED', ownerToken: null, leaseExpiresAt: null },
        },
      ]);
      expect(ordersService.findForCheckout).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    });

    it.each([
      [
        'an order cancelled meanwhile',
        { status: 'CANCELLED', items: [{ reservationId: 'r-1' }] },
        [{ status: 'RELEASED', expiresAt: new Date(Date.now() + 60_000) }],
        false,
      ],
      [
        'a line without a reservation',
        {
          status: 'PENDING_PAYMENT',
          items: [{ reservationId: 'r-1' }, { reservationId: null }],
        },
        [{ status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000) }],
        true,
      ],
      [
        'an ACTIVE reservation already past its expiry',
        { status: 'PENDING_PAYMENT', items: [{ reservationId: 'r-1' }] },
        [{ status: 'ACTIVE', expiresAt: new Date(Date.now() - 1) }],
        true,
      ],
      [
        'a reservation that no longer exists',
        {
          status: 'PENDING_PAYMENT',
          items: [{ reservationId: 'r-1' }, { reservationId: 'r-2' }],
        },
        [{ status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000) }],
        true,
      ],
      [
        'an order with no items',
        { status: 'PENDING_PAYMENT', items: [] },
        [],
        true,
      ],
    ])(
      'gives up on %s as CHECKOUT_EXPIRED under its own fence',
      async (_case, order, reservations, cancels) => {
        prisma.checkoutAttempt.findUnique.mockResolvedValue(
          attempt({ orderId: 'order-1', stage: 'ORDER_CREATED' }),
        );
        prisma.checkoutAttempt.findUniqueOrThrow.mockResolvedValue({
          orderId: 'order-1',
        });
        ordersService.findForCheckout.mockResolvedValue({
          id: 'order-1',
          ...order,
        });
        prisma.reservation.findMany.mockResolvedValue(reservations);

        const error = await rejectionOf(run());

        expect(codeOf(error)).toBe(CHECKOUT_EXPIRED);
        expect(detailsOf(error)).toContainEqual({
          field: 'orderId',
          message: 'order-1',
        });
        if (cancels)
          expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
        else expect(ordersService.cancel).not.toHaveBeenCalled();
        expect(writesWithStatus('REJECTED')).toEqual([
          expect.objectContaining({
            where: {
              id: 'attempt-1',
              ownerToken: claimedToken(),
              status: 'IN_PROGRESS',
            },
          }),
        ]);
        expect(execute).not.toHaveBeenCalled();
      },
    );

    it('releases its claim and rethrows when resuming fails transiently', async () => {
      const failure = new Error('connection reset');
      prisma.checkoutAttempt.findUnique.mockResolvedValue(
        attempt({ orderId: 'order-1' }),
      );
      prisma.checkoutAttempt.findUniqueOrThrow.mockResolvedValue({
        orderId: 'order-1',
      });
      ordersService.findForCheckout.mockRejectedValue(failure);

      await expect(run()).rejects.toBe(failure);

      expect(prisma.checkoutAttempt.updateMany).toHaveBeenLastCalledWith({
        where: {
          id: 'attempt-1',
          ownerToken: claimedToken(),
          status: 'IN_PROGRESS',
        },
        data: { ownerToken: null, leaseExpiresAt: null },
      });
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('classifying a failed execution', () => {
    let ownerToken: string;

    /** The attempt as re-read after `execute` failed. */
    function reread(state: Record<string, unknown>): void {
      prisma.checkoutAttempt.findUnique
        .mockReset()
        .mockResolvedValueOnce(null)
        .mockImplementation(() => {
          ownerToken = (
            firstCallArgument(prisma.checkoutAttempt.create) as {
              data: { ownerToken: string };
            }
          ).data.ownerToken;
          return Promise.resolve({
            orderId: null,
            status: 'IN_PROGRESS',
            ownerToken,
            ...state,
          });
        });
    }

    const definite = (): Error => new BadRequestException('Invalid card');
    const serverError = (): Error => new ServiceUnavailableException();
    const transient = (): Error => new Error('connection reset');

    // Outcome, attempt's order, its payment status, the order's status, error.
    it.each([
      ['no order, definite refusal', 'REJECTED', null, null, null, definite],
      ['no order, 5xx', 'RELEASED', null, null, null, serverError],
      ['no order, non-HTTP error', 'RELEASED', null, null, null, transient],
      [
        'pending order, no payment, transient',
        'RELEASED',
        'order-1',
        null,
        'PENDING_PAYMENT',
        transient,
      ],
      [
        'pending order, no payment, definite',
        'REJECTED',
        'order-1',
        null,
        'PENDING_PAYMENT',
        definite,
      ],
      [
        'cancelled order, no payment, transient',
        'REJECTED',
        'order-1',
        null,
        'CANCELLED',
        transient,
      ],
      ['payment FAILED', 'REJECTED', 'order-1', 'FAILED', null, transient],
      ['payment CANCELLED', 'REJECTED', 'order-1', 'CANCELLED', null, definite],
      ['payment PENDING', 'BLOCKED', 'order-1', 'PENDING', null, serverError],
      [
        'payment REQUIRES_ACTION',
        'BLOCKED',
        'order-1',
        'REQUIRES_ACTION',
        null,
        definite,
      ],
      [
        'payment PROCESSING',
        'BLOCKED',
        'order-1',
        'PROCESSING',
        null,
        transient,
      ],
      ['payment SUCCEEDED', 'BLOCKED', 'order-1', 'SUCCEEDED', null, transient],
    ])(
      '%s → %s',
      async (
        _case,
        outcome,
        orderId,
        paymentStatus,
        orderStatus,
        makeError,
      ) => {
        reread({ orderId });
        if (paymentStatus)
          paymentsService.findForOrder.mockResolvedValue({
            id: 'payment-1',
            status: paymentStatus,
          });
        if (orderStatus)
          prisma.order.findUnique.mockResolvedValue({ status: orderStatus });
        const error = makeError();
        execute.mockRejectedValue(error);

        await expect(run()).rejects.toBe(error);

        // Exactly one owner-fenced write, of the expected kind.
        const writes = prisma.checkoutAttempt.updateMany.mock.calls.map(
          ([args]) =>
            args as {
              where: Record<string, unknown>;
              data: Record<string, unknown>;
            },
        );
        expect(writes).toHaveLength(1);
        const [{ where, data }] = writes as [(typeof writes)[number]];
        expect(where).toEqual({
          id: 'attempt-1',
          ownerToken,
          status: 'IN_PROGRESS',
        });
        if (outcome === 'RELEASED')
          expect(data).toEqual({ ownerToken: null, leaseExpiresAt: null });
        else if (outcome === 'BLOCKED')
          expect(data).toEqual({
            status: 'BLOCKED',
            ownerToken: null,
            leaseExpiresAt: null,
          });
        else
          expect(data).toEqual({
            status: 'REJECTED',
            stage: 'FINISHED',
            response: expect.anything() as unknown,
            errorStatus: expect.any(Number) as unknown,
            completedAt: expect.any(Date) as unknown,
            ownerToken: null,
            leaseExpiresAt: null,
          });
      },
    );

    it.each([
      ['another request owns it now', { ownerToken: 'someone-else' }],
      ['it was finished meanwhile', { status: 'COMPLETED', ownerToken: null }],
      ['it was blocked meanwhile', { status: 'BLOCKED', ownerToken: null }],
    ])('records nothing when %s', async (_case, state) => {
      reread({ orderId: 'order-1', ...state });
      paymentsService.findForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'PENDING',
      });
      const error = new BadRequestException('Invalid card');
      execute.mockRejectedValue(error);

      await expect(run()).rejects.toBe(error);

      expect(prisma.checkoutAttempt.updateMany).not.toHaveBeenCalled();
      expect(paymentsService.findForOrder).not.toHaveBeenCalled();
    });

    it('records nothing when the attempt row is gone', async () => {
      prisma.checkoutAttempt.findUnique
        .mockReset()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(null);
      execute.mockRejectedValue(new BadRequestException('Invalid card'));

      await expect(run()).rejects.toThrow('Invalid card');
      expect(prisma.checkoutAttempt.updateMany).not.toHaveBeenCalled();
    });

    it('stores an HTTP refusal body verbatim with its status', async () => {
      reread({});
      const refusal = new BadRequestException({
        message: 'Invalid card',
        details: [{ field: 'card', message: 'expired' }],
      });
      execute.mockRejectedValue(refusal);

      await expect(run()).rejects.toBe(refusal);

      expect(writesWithStatus('REJECTED')).toEqual([
        expect.objectContaining({
          data: expect.objectContaining({
            errorStatus: 400,
            response: refusal.getResponse(),
          }) as unknown,
        }),
      ]);
    });

    it('stores a non-HTTP 4xx error as the global filter would render it', async () => {
      reread({ orderId: 'order-1' });
      paymentsService.findForOrder.mockResolvedValue({
        id: 'payment-1',
        status: 'FAILED',
      });
      execute.mockRejectedValue(
        Object.assign(new Error('Card declined'), { status: 402 }),
      );

      await expect(run()).rejects.toThrow('Card declined');

      expect(writesWithStatus('REJECTED')).toEqual([
        expect.objectContaining({
          data: expect.objectContaining({
            errorStatus: 402,
            response: { statusCode: 402, message: 'Card declined' },
          }) as unknown,
        }),
      ]);
    });
  });
});
