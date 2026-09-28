/**
 * How a figure moved against the same-length window before it.
 *
 * `null` percent means there's nothing to compare with — no sales in the
 * previous window — which a dashboard says in words rather than showing
 * an infinite or made-up percentage.
 */
export type PeriodChange = {
  direction: 'up' | 'down' | 'flat';
  /** Whole percent, rounded; null when the previous figure was zero. */
  percent: number | null;
};

export function periodChange(current: number, previous: number): PeriodChange {
  if (previous === 0) {
    return { direction: current > 0 ? 'up' : 'flat', percent: null };
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  return {
    direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat',
    percent,
  };
}

/** "12% more than", "3% less than", "the same as" — for a tile's footnote. */
export function describeChange(change: PeriodChange, period: string): string {
  if (change.percent === null) {
    return change.direction === 'up'
      ? `New — nothing in the previous ${period}`
      : `Nothing in this or the previous ${period}`;
  }
  if (change.percent === 0) return `Same as the previous ${period}`;
  return `${Math.abs(change.percent)}% ${
    change.direction === 'up' ? 'up on' : 'down on'
  } the previous ${period}`;
}

/** Each item's share of the largest, for ranked bars (0–100). */
export function barWidths(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((value) => (max > 0 ? (value / max) * 100 : 0));
}
