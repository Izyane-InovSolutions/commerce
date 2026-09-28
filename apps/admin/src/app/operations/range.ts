/**
 * The operations date range, as typed into the page's filter.
 *
 * The form posts calendar days (`2026-09-01`) because that is what a date
 * input gives; the API wants ISO timestamps. A day is read as a whole UTC day,
 * so "to 2026-09-30" includes orders placed on the 30th rather than stopping
 * at its first millisecond.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDay(value: string | undefined): value is string {
  if (value === undefined || !DAY.test(value)) {
    return false;
  }
  // `new Date` rolls 2026-02-31 over into March instead of rejecting it, so
  // the round trip is what proves the day exists.
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export type OperationsRange = {
  /** What the API is asked for; either bound may be absent. */
  query: { from?: string; to?: string };
  /** What the form shows back, so the inputs keep what was typed. */
  fromDay?: string;
  toDay?: string;
  /** Set when the range is the wrong way round, so no request is made. */
  error?: string;
};

export function parseOperationsRange(
  fromInput: string | undefined,
  toInput: string | undefined,
): OperationsRange {
  const fromDay = isCalendarDay(fromInput) ? fromInput : undefined;
  const toDay = isCalendarDay(toInput) ? toInput : undefined;

  if (fromDay !== undefined && toDay !== undefined && fromDay > toDay) {
    return {
      query: {},
      fromDay,
      toDay,
      error: 'The start date must be on or before the end date.',
    };
  }

  return {
    query: {
      from: fromDay === undefined ? undefined : `${fromDay}T00:00:00.000Z`,
      to: toDay === undefined ? undefined : `${toDay}T23:59:59.999Z`,
    },
    fromDay,
    toDay,
  };
}
