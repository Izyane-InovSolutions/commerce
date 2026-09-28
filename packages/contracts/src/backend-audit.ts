/* ---- the audit log (GET /admin/audit-events) ---- */

/**
 * One privileged action, as the audit log recorded it.
 *
 * `metadata` is whatever the acting module chose to attach — a reason, a
 * before/after pair, a count — so it is left untyped here rather than guessed
 * at; readers render it as data. `actorEmail` is resolved by the API at read
 * time and is null for system actions and for actors since deleted.
 */
export type BackendAuditEvent = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

/** Filters the audit log accepts. `from`/`to` are ISO timestamps, inclusive. */
export type BackendAuditEventQuery = {
  page?: number;
  limit?: number;
  action?: string;
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
};
