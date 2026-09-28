import type { BackendAuditEventQuery } from '@commerce/contracts';

import { endOfDayIso, isIsoDate, startOfDayIso } from './date-range';
import { readParam, type RawSearchParams } from './search-params';

/** Rows per page of the audit log. */
export const AUDIT_PAGE_SIZE = 50;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The log's filters as the URL carries them, after validation. */
export type AuditFilters = {
  page: number;
  action?: string;
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  /** Inclusive UTC calendar dates, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
};

function text(params: RawSearchParams, key: string): string | undefined {
  const value = readParam(params, key)?.trim();
  return value === undefined || value === '' ? undefined : value.slice(0, 200);
}

/**
 * Reads the audit filters from the URL.
 *
 * Each value is validated on its own, so a pasted actor id with a typo drops
 * only that filter — the rest still narrow the log, rather than the whole
 * query falling back to "everything" the way a single schema parse would.
 */
export function readAuditFilters(params: RawSearchParams): AuditFilters {
  const requested = Number(readParam(params, 'page') ?? '1');
  const actorUserId = text(params, 'actorUserId');
  const from = readParam(params, 'from');
  const to = readParam(params, 'to');

  return {
    page: Number.isInteger(requested) && requested > 0 ? requested : 1,
    action: text(params, 'action'),
    actorUserId:
      actorUserId !== undefined && UUID.test(actorUserId)
        ? actorUserId
        : undefined,
    targetType: text(params, 'targetType'),
    targetId: text(params, 'targetId'),
    from: from !== undefined && isIsoDate(from) ? from : undefined,
    to: to !== undefined && isIsoDate(to) ? to : undefined,
  };
}

/** True when anything beyond the page narrows the log. */
export function isAuditFiltered(filters: AuditFilters): boolean {
  return [
    filters.action,
    filters.actorUserId,
    filters.targetType,
    filters.targetId,
    filters.from,
    filters.to,
  ].some((value) => value !== undefined);
}

/** The filters as the API takes them: inclusive ISO bounds on `createdAt`. */
export function toAuditEventQuery(
  filters: AuditFilters,
): BackendAuditEventQuery {
  return {
    page: filters.page,
    limit: AUDIT_PAGE_SIZE,
    action: filters.action,
    actorUserId: filters.actorUserId,
    targetType: filters.targetType,
    targetId: filters.targetId,
    from: filters.from ? startOfDayIso(filters.from) : undefined,
    to: filters.to ? endOfDayIso(filters.to) : undefined,
  };
}

/**
 * An event's metadata as readable text, or null when there is none worth
 * showing — an empty object is as good as no metadata.
 */
export function formatAuditMetadata(metadata: unknown): string | null {
  if (metadata === null || metadata === undefined) {
    return null;
  }
  if (
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    Object.keys(metadata).length === 0
  ) {
    return null;
  }
  if (typeof metadata === 'string') {
    return metadata;
  }
  return JSON.stringify(metadata, null, 2);
}

/**
 * A one-line preview of an event's metadata — its first few top-level keys —
 * so the collapsed row still says what kind of detail is inside.
 */
export function summarizeAuditMetadata(metadata: unknown, limit = 3): string {
  if (typeof metadata !== 'object' || metadata === null) {
    return typeof metadata === 'string' ? metadata.slice(0, 80) : '';
  }
  if (Array.isArray(metadata)) {
    return `${metadata.length} item${metadata.length === 1 ? '' : 's'}`;
  }
  const keys = Object.keys(metadata);
  const shown = keys.slice(0, limit).join(', ');
  return keys.length > limit ? `${shown}, +${keys.length - limit} more` : shown;
}
