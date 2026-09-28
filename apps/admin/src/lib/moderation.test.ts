import { describe, expect, it } from 'vitest';

import {
  MODERATION_PAGE_SIZE,
  isModerationFiltered,
  moderationDecisionsFor,
  parseModerationForm,
  readModerationFilters,
  toAdminReviewQuery,
} from './moderation';

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

describe('readModerationFilters', () => {
  it('reads every filter the queue understands', () => {
    expect(
      readModerationFilters({
        page: '3',
        type: 'seller',
        visibility: 'HIDDEN',
        moderationState: 'FLAGGED',
        reported: 'yes',
      }),
    ).toEqual({
      page: 3,
      type: 'seller',
      visibility: 'HIDDEN',
      moderationState: 'FLAGGED',
      hasOpenReport: true,
    });
  });

  it('drops an unknown value but keeps the rest', () => {
    const filters = readModerationFilters({
      type: 'store',
      visibility: 'PUBLISHED',
      reported: 'no',
    });
    expect(filters.type).toBeUndefined();
    expect(filters.visibility).toBe('PUBLISHED');
    expect(filters.hasOpenReport).toBe(false);
  });

  it('falls back to the first page for a bad page number', () => {
    expect(readModerationFilters({ page: '0' }).page).toBe(1);
    expect(readModerationFilters({ page: '2.5' }).page).toBe(1);
    expect(readModerationFilters({ page: 'x' }).page).toBe(1);
  });

  it('treats any other reported value as either', () => {
    expect(readModerationFilters({ reported: 'maybe' }).hasOpenReport).toBe(
      undefined,
    );
  });
});

describe('isModerationFiltered', () => {
  it('ignores the page', () => {
    expect(isModerationFiltered(readModerationFilters({ page: '4' }))).toBe(
      false,
    );
  });

  it('counts "no open report" as a filter', () => {
    expect(
      isModerationFiltered(readModerationFilters({ reported: 'no' })),
    ).toBe(true);
  });
});

describe('toAdminReviewQuery', () => {
  it('pages at the queue size and passes the filters through', () => {
    expect(
      toAdminReviewQuery({ page: 2, type: 'product', hasOpenReport: false }),
    ).toEqual({
      page: 2,
      limit: MODERATION_PAGE_SIZE,
      type: 'product',
      visibility: undefined,
      moderationState: undefined,
      hasOpenReport: false,
    });
  });
});

describe('moderationDecisionsFor', () => {
  it('offers approve, hide and remove on a published review', () => {
    expect(moderationDecisionsFor('PUBLISHED', 'PENDING')).toEqual([
      'approve',
      'hide',
      'remove',
    ]);
  });

  it('does not offer approve again once approved', () => {
    expect(moderationDecisionsFor('PUBLISHED', 'APPROVED')).toEqual([
      'hide',
      'remove',
    ]);
  });

  it('offers restore, not hide, on a hidden review', () => {
    expect(moderationDecisionsFor('HIDDEN', 'FLAGGED')).toEqual([
      'approve',
      'restore',
      'remove',
    ]);
  });

  it('offers nothing on a removed or withdrawn review', () => {
    expect(moderationDecisionsFor('REMOVED', 'FLAGGED')).toEqual([]);
    expect(moderationDecisionsFor('WITHDRAWN', 'PENDING')).toEqual([]);
  });
});

describe('parseModerationForm', () => {
  it('accepts an approval without a reason', () => {
    expect(
      parseModerationForm(form({ decision: 'approve', version: '2' })),
    ).toEqual({ ok: true, decision: 'approve', version: 2, reason: undefined });
  });

  it('drops a reason given with an approval', () => {
    const parsed = parseModerationForm(
      form({ decision: 'approve', version: '0', reason: 'fine' }),
    );
    expect(parsed).toEqual({
      ok: true,
      decision: 'approve',
      version: 0,
      reason: undefined,
    });
  });

  it('requires a reason to hide, remove or restore', () => {
    for (const decision of ['hide', 'remove', 'restore']) {
      const parsed = parseModerationForm(
        form({ decision, version: '1', reason: '   ' }),
      );
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.fieldErrors.reason).toHaveLength(1);
      }
    }
  });

  it('trims the reason it keeps', () => {
    expect(
      parseModerationForm(
        form({ decision: 'hide', version: '4', reason: '  spam  ' }),
      ),
    ).toEqual({ ok: true, decision: 'hide', version: 4, reason: 'spam' });
  });

  it('rejects an unknown decision and a bad version', () => {
    const parsed = parseModerationForm(
      form({ decision: 'delete', version: '-1' }),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(Object.keys(parsed.fieldErrors).sort()).toEqual([
        'decision',
        'version',
      ]);
    }
  });
});
