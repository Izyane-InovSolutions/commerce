import { describe, expect, it } from 'vitest';

import { barWidths, describeChange, periodChange } from './insights';

describe('periodChange', () => {
  it('compares against the previous window', () => {
    expect(periodChange(120, 100)).toEqual({ direction: 'up', percent: 20 });
    expect(periodChange(75, 100)).toEqual({ direction: 'down', percent: -25 });
    expect(periodChange(100, 100)).toEqual({ direction: 'flat', percent: 0 });
  });

  it('has no percentage when there was nothing before', () => {
    expect(periodChange(50, 0)).toEqual({ direction: 'up', percent: null });
    expect(periodChange(0, 0)).toEqual({ direction: 'flat', percent: null });
  });
});

describe('describeChange', () => {
  it('says it in words', () => {
    expect(describeChange(periodChange(120, 100), '30 days')).toBe(
      '20% up on the previous 30 days',
    );
    expect(describeChange(periodChange(75, 100), '30 days')).toBe(
      '25% down on the previous 30 days',
    );
    expect(describeChange(periodChange(5, 0), '30 days')).toBe(
      'New — nothing in the previous 30 days',
    );
    expect(describeChange(periodChange(0, 0), '30 days')).toBe(
      'Nothing in this or the previous 30 days',
    );
  });
});

describe('barWidths', () => {
  it('scales to the largest value', () => {
    expect(barWidths([50, 100, 0])).toEqual([50, 100, 0]);
    expect(barWidths([0, 0])).toEqual([0, 0]);
  });
});
