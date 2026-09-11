import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { redact } from '../../infrastructure/logging/redact';
import { RecordAuditEventInput } from './audit-event';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: RecordAuditEventInput): Promise<void> {
    await this.prisma.auditEvent.create({
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
