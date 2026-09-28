/**
 * Calendar-date helpers for the report filters.
 *
 * Filters are typed as plain `YYYY-MM-DD` dates (what `<input type="date">`
 * posts) and read in UTC, because that is how the API buckets and bounds
 * them. A date range is inclusive at both ends, so the upper date has to
 * become the *last* instant of its day — sending it as midnight would quietly
 * drop everything that happened on the day the reader asked for.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** True for a real calendar date written as `YYYY-MM-DD` — not `2026-02-30`. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** The first instant of a UTC calendar date. */
export function startOfDayIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

/** The last instant of a UTC calendar date. */
export function endOfDayIso(date: string): string {
  return `${date}T23:59:59.999Z`;
}

/** Today's UTC calendar date. */
export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A UTC calendar date moved by some number of days (negative for earlier). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(startOfDayIso(date)) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}
