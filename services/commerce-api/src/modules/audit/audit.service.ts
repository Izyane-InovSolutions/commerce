import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { redact } from '../../infrastructure/logging/redact';
import { RecordAuditEventInput } from './audit-event';

type AuditClient = Pick<Prisma.TransactionClient, 'auditEvent'>;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `client`, when given, writes the audit row inside the caller's own
   * transaction — used by procurement so a posted receipt and the audit
   * event that explains it commit or roll back together.
   */
  async record(
    event: RecordAuditEventInput,
    client: AuditClient = this.prisma,
  ): Promise<void> {
    await client.auditEvent.create({
      data: {
        actorUserId: event.actorUserId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        metadata: event.metadata
          ? (redact(event.metadata) as Prisma.InputJsonValue)
          : undefined,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
      },
    });
  }
}
