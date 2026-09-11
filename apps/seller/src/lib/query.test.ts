import {
  inventoryListQuerySchema,
  offerListQuerySchema,
} from '@commerce/contracts';
import { describe, expect, it } from 'vitest';

import { parseQueryParams } from './query';

describe('parseQueryParams', () => {
  it('applies schema defaults when nothing is supplied', () => {
    const query = parseQueryParams(offerListQuerySchema, {});

    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
  });

  it('drops blank values left by an empty filter field', () => {
    const query = parseQueryParams(offerListQuerySchema, {
      q: '',
      status: '',
    });

    expect(query.q).toBeUndefined();
    expect(query.status).toBeUndefined();
  });

  it('coerces a numeric page from the address bar', () => {
    expect(parseQueryParams(offerListQuerySchema, { page: '3' }).page).toBe(3);
  });

  it('coerces a boolean filter from its string form', () => {
    const query = parseQueryParams(inventoryListQuerySchema, {
      belowThreshold: 'true',
    });

    expect(query.belowThreshold).toBe(true);
  });

  it('falls back to defaults rather than throwing on junk input', () => {
    const query = parseQueryParams(offerListQuerySchema, {
      page: 'banana',
      status: 'not-a-status',
    });

    expect(query.page).toBe(1);
    expect(query.status).toBeUndefined();
  });

  it('takes the first value of a repeated parameter', () => {
    expect(
      parseQueryParams(offerListQuerySchema, { q: ['desk', 'chair'] }).q,
    ).toBe('desk');
  });

  it('ignores parameters the schema does not declare', () => {
    const query = parseQueryParams(offerListQuerySchema, {
      q: 'desk',
      injected: 'value',
    });

    expect(query.q).toBe('desk');
    expect('injected' in query).toBe(false);
  });
});
