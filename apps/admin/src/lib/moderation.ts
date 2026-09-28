import {
  backendReviewModerationStateSchema,
  backendReviewTargetSchema,
  backendReviewVisibilitySchema,
  type BackendAdminReviewQuery,
  type BackendReviewTarget,
} from '@commerce/contracts';
import type { z } from 'zod';

import { readParam, type RawSearchParams } from './search-params';

export const MODERATION_PAGE_SIZE = 20;

type Visibility = z.infer<typeof backendReviewVisibilitySchema>;
type ModerationState = z.infer<typeof backendReviewModerationStateSchema>;

export const reviewVisibilities = backendReviewVisibilitySchema.options;
export const reviewModerationStates = backendReviewModerationStateSchema.options;

/** The queue's filters as the URL carries them, after validation. */
export type ModerationFilters = {
  page: number;
  type?: BackendReviewTarget;
  visibility?: Visibility;
  moderationState?: ModerationState;
  /** `true` = has an open report, `false` = has none, absent = either. */
  hasOpenReport?: boolean;
};

function pick<T extends string>(
  options: readonly T[],
  value: string | undefined,
): T | undefined {
  return value !== undefined && (options as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * Reads the moderation queue's filters from the URL, one value at a time, so
 * a stale bookmark with one retired value still applies the rest.
 */
export function readModerationFilters(
  params: RawSearchParams,
): ModerationFilters {
  const requested = Number(readParam(params, 'page') ?? '1');
  const reported = readParam(params, 'reported');

  return {
    page: Number.isInteger(requested) && requested > 0 ? requested : 1,
    type: pick(backendReviewTargetSchema.options, readParam(params, 'type')),
    visibility: pick(reviewVisibilities, readParam(params, 'visibility')),
    moderationState: pick(
      reviewModerationStates,
      readParam(params, 'moderationState'),
    ),
    hasOpenReport:
      reported === 'yes' ? true : reported === 'no' ? false : undefined,
  };
}

export function isModerationFiltered(filters: ModerationFilters): boolean {
  return (
    filters.type !== undefined ||
    filters.visibility !== undefined ||
    filters.moderationState !== undefined ||
    filters.hasOpenReport !== undefined
  );
}

export function toAdminReviewQuery(
  filters: ModerationFilters,
): BackendAdminReviewQuery {
  return {
    page: filters.page,
    limit: MODERATION_PAGE_SIZE,
    type: filters.type,
    visibility: filters.visibility,
    moderationState: filters.moderationState,
    hasOpenReport: filters.hasOpenReport,
  };
}

export type ModerationDecision = 'approve' | 'hide' | 'remove' | 'restore';

/**
 * The decisions the API will accept from where a review stands — mirroring
 * `AdminReviewsService`: approve anything not removed or withdrawn (and not
 * already approved), hide only what is published, remove what is published
 * or hidden, restore only what is hidden. Offering anything else would only
 * earn a 409.
 */
export function moderationDecisionsFor(
  visibility: Visibility,
  moderationState: ModerationState,
): ModerationDecision[] {
  const decisions: ModerationDecision[] = [];
  if (
    (visibility === 'PUBLISHED' || visibility === 'HIDDEN') &&
    moderationState !== 'APPROVED'
  ) {
    decisions.push('approve');
  }
  if (visibility === 'PUBLISHED') {
    decisions.push('hide');
  }
  if (visibility === 'HIDDEN') {
    decisions.push('restore');
  }
  if (visibility === 'PUBLISHED' || visibility === 'HIDDEN') {
    decisions.push('remove');
  }
  return decisions;
}

export type ParsedModerationForm =
  | {
      ok: true;
      decision: ModerationDecision;
      version: number;
      /** Absent for an approval, which records no reason. */
      reason?: string;
    }
  | { ok: false; fieldErrors: Record<string, string[]> };

const DECISIONS: readonly ModerationDecision[] = [
  'approve',
  'hide',
  'remove',
  'restore',
];

/**
 * Reads a moderation decision off its form. Hide, remove and restore each
 * need a reason (it goes on the moderation event and, for hide/remove, closes
 * any open reports); approve takes none.
 */
export function parseModerationForm(formData: FormData): ParsedModerationForm {
  const decision = pick(DECISIONS, String(formData.get('decision') ?? ''));
  const version = Number(formData.get('version'));
  const reason = String(formData.get('reason') ?? '').trim();

  const fieldErrors: Record<string, string[]> = {};
  if (!decision) {
    fieldErrors.decision = ['Choose a decision.'];
  }
  if (!Number.isInteger(version) || version < 0) {
    fieldErrors.version = ['Reload the page and try again.'];
  }
  if (decision && decision !== 'approve' && reason === '') {
    fieldErrors.reason = ['Give a reason — it is recorded with the decision.'];
  }
  if (!decision || Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    decision,
    version,
    reason: decision === 'approve' ? undefined : reason,
  };
}
