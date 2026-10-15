import { createHash } from 'node:crypto';
import { ConflictException, HttpException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CheckoutResult } from './checkout.types';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

@Injectable()
export class CheckoutAttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    userId: string,
    key: string | undefined,
    operation: 'cart' | 'buy-now',
    body: unknown,
    execute: (attemptId?: string) => Promise<CheckoutResult>,
  ): Promise<CheckoutResult> {
    if (!key) return execute();
    const fingerprint = createHash('sha256').update(canonical(body)).digest('hex');
    let attempt;
    try {
      attempt = await this.prisma.checkoutAttempt.create({
        data: { userId, key, operation, fingerprint },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.checkoutAttempt.findUniqueOrThrow({
        where: { userId_key: { userId, key } },
      });
      if (existing.operation !== operation || existing.fingerprint !== fingerprint)
        throw new ConflictException('Idempotency-Key was already used for a different checkout request');
      if (existing.status === 'COMPLETED') return existing.response as unknown as CheckoutResult;
      if (existing.status === 'REJECTED')
        throw new HttpException(existing.response as unknown as string, existing.errorStatus ?? 500);
      // Never free a key based on absence of payment: the original request may
      // still be creating it, or a crashed process may have submitted a charge.
      throw new ConflictException('Checkout is in progress or requires reconciliation; retry this same key later');
    }
    let result: CheckoutResult;
    try {
      result = await execute(attempt.id);
    } catch (error) {
      // Only an explicit HTTP rejection is a definite outcome. Unknown errors
      // (including database failures after a charge) retain IN_PROGRESS.
      const receipt = await this.prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      const payment = receipt.orderId ? await this.prisma.payment.findUnique({ where: { orderId: receipt.orderId } }) : null;
      if (error instanceof HttpException && (!receipt.orderId || payment?.status === 'FAILED' || payment?.status === 'CANCELLED')) {
        await this.prisma.checkoutAttempt.update({
          where: { id: attempt.id },
          data: { status: 'REJECTED', errorStatus: error.getStatus(),
            response: JSON.parse(JSON.stringify(error.getResponse())) as Prisma.InputJsonValue },
        });
      }
      throw error;
    }
    await this.prisma.checkoutAttempt.update({
      where: { id: attempt.id },
      data: { status: 'COMPLETED', response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue },
    });
    return result;
  }
}
