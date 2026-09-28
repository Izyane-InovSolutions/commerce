import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { BackgroundJobsService } from '../../../infrastructure/jobs/background-jobs.service';
import { registerRecurringTask } from '../../../infrastructure/jobs/recurring-task';
import { PAYMENT_RECONCILIATION_JOB_TYPE } from './payment-reconciliation.handler';

@Injectable()
export class PaymentReconciliationScheduler implements OnModuleInit {
  private readonly logger = new Logger(PaymentReconciliationScheduler.name);
  constructor(private readonly prisma: PrismaService, private readonly jobs: BackgroundJobsService, private readonly config: ConfigService, private readonly registry: SchedulerRegistry) {}

  onModuleInit(): void {
    if (this.config.get('PAYMENTS_PROVIDER', 'pending') !== 'unified') return;
    registerRecurringTask(this.registry, this.config, {
      name: 'payments.reconciliation', intervalMs: 30_000,
      run: () => this.sweep(), logger: this.logger,
    });
  }

  async sweep(): Promise<void> {
    // A transaction-scoped lock also prevents duplicate sweeps across API replicas.
    await this.prisma.$transaction(async tx => {
      const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(730021) AS acquired`;
      if (!lock?.acquired) return;
      const open = await tx.backgroundJob.findMany({ where: { type: PAYMENT_RECONCILIATION_JOB_TYPE, status: { in: ['PENDING', 'RUNNING'] } }, select: { payload: true } });
      const queued = open.flatMap(row => row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) && typeof row.payload.paymentId === 'string' ? [row.payload.paymentId] : []);
      const payments = await tx.payment.findMany({
        where: { id: { notIn: queued }, provider: 'unified', providerReference: { not: null }, status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.REQUIRES_ACTION] }, createdAt: { lt: new Date(Date.now() - 30_000) } },
        orderBy: { updatedAt: 'asc' }, take: 100, select: { id: true },
      });
      for (const payment of payments) await this.jobs.enqueue({ type: PAYMENT_RECONCILIATION_JOB_TYPE, payload: { paymentId: payment.id } }, tx);
    });
  }
}
