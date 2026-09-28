import { describe, expect, it } from 'vitest';

import { parseOperationsRange } from './range';

describe('parseOperationsRange', () => {
  it('asks for the API default when no dates are given', () => {
    expect(parseOperationsRange(undefined, undefined)).toEqual({
      query: { from: undefined, to: undefined },
      fromDay: undefined,
      toDay: undefined,
    });
  });

  it('turns calendar days into whole UTC days', () => {
    expect(parseOperationsRange('2026-09-01', '2026-09-30').query).toEqual({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    });
  });

  it('accepts a single day as both bounds', () => {
    const range = parseOperationsRange('2026-09-15', '2026-09-15');
    expect(range.error).toBeUndefined();
    expect(range.query.from).toBe('2026-09-15T00:00:00.000Z');
    expect(range.query.to).toBe('2026-09-15T23:59:59.999Z');
  });

  it('refuses a range that runs backwards without asking the API', () => {
    const range = parseOperationsRange('2026-09-30', '2026-09-01');
    expect(range.error).toMatch(/on or before/);
    expect(range.query).toEqual({});
    expect(range.fromDay).toBe('2026-09-30');
  });

  it('drops a malformed or impossible day rather than sending it', () => {
    const range = parseOperationsRange('2026-02-31', 'yesterday');
    expect(range.query).toEqual({ from: undefined, to: undefined });
    expect(range.fromDay).toBeUndefined();
    expect(range.toDay).toBeUndefined();
  });
});
