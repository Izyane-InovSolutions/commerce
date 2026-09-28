import type { Prisma } from '@prisma/client';

export type RecordAuditEventInput = {
  actorUserId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

/** An audit row as the admin audit log returns it. `actorEmail` is looked up
 * separately (audit_events has no user relation) and is null for system
 * events or once the actor's account is gone. */
export type AuditEventView = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Prisma.JsonValue | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

export type AuditEventPage = {
  items: AuditEventView[];
  total: number;
  page: number;
  limit: number;
};
