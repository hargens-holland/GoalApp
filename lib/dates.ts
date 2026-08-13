/**
 * Date and ISO-week helpers.
 *
 * TIMEZONE CONTRACT: the entire application stores and computes dates in UTC.
 * A task's `date` is UTC midnight for the day it belongs to, and
 * `scheduledStart` / `scheduledEnd` are UTC datetimes. Every function here
 * therefore reads and writes UTC components exclusively — never local-time
 * getters, which would resolve differently depending on the server's timezone
 * and could shift a task into an adjacent day or ISO week.
 */

/** Extract the UTC calendar day of a date, as UTC midnight. */
function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

/**
 * ISO-8601 week number and its week-year for a date.
 *
 * The week-year is not always the calendar year: Jan 1 can fall in the final
 * week of the previous year, and Dec 29-31 can fall in week 1 of the next. Weekly
 * progress snapshots are keyed on (weekNumber, year), so this pairing has to be
 * the ISO one or snapshots would collide at year boundaries.
 */
export function getWeekInfo(date: Date = new Date()): {
  weekNumber: number;
  year: number;
} {
  const d = utcMidnight(date);
  // Shift to the Thursday of this week: the ISO week-year is defined by
  // whichever year that Thursday falls in.
  const dayNum = d.getUTCDay() || 7; // treat Sunday (0) as 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((d.valueOf() - yearStart.valueOf()) / 86400000 + 1) / 7
  );
  return { weekNumber, year: d.getUTCFullYear() };
}

/** The Monday-to-Sunday UTC range containing `date`. */
export function getWeekRange(date: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const d = utcMidnight(date);
  const dayNum = d.getUTCDay() || 7; // Sunday = 7, so weeks start Monday
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - (dayNum - 1));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

/** ISO date string (YYYY-MM-DD) for a date, in UTC. */
export function toISODate(date: Date): string {
  return utcMidnight(date).toISOString().slice(0, 10);
}

/** Parse a YYYY-MM-DD string into a Date at UTC midnight. */
export function fromISODate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

/** Every calendar date (YYYY-MM-DD) from `start` to `end`, inclusive. */
export function eachDate(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cursor = utcMidnight(start);
  const last = utcMidnight(end);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
