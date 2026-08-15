/**
 * School-local civil time.
 *
 * Stored timestamps are real instants. Timetables, operational hours and every
 * other academic rule are expressed in the *school's* civil time. The two are
 * only ever connected through the tenant's IANA timezone — never through the
 * server's locale, and never by swapping `getUTCHours()` for `getHours()`,
 * which merely moves the bug onto whatever machine happens to run the code.
 *
 * The conversion uses `Intl.DateTimeFormat`, which carries the IANA rules for
 * historical and future offsets, so it stays correct for zones with DST even
 * though the demo school's `Asia/Ho_Chi_Minh` has none.
 */

/** A civil (wall-clock) date and time in some timezone. */
export interface CivilDateTime {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
  /** 0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay`. */
  weekday: number;
  /** 0–23. */
  hour: number;
  /** 0–59. */
  minute: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Formatters are expensive to construct and safe to reuse. */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  // `en-US` is chosen only because its part vocabulary is stable and ASCII; no
  // formatted output is ever shown to a user from here.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/**
 * Converts an instant into the civil date and time it represents in a timezone.
 *
 * @param instant - The instant to convert.
 * @param timeZone - IANA timezone, e.g. `"Asia/Ho_Chi_Minh"`.
 * @throws RangeError when `timeZone` is not a valid IANA identifier — an
 *   unknown zone is a configuration error and must never fall back to UTC or to
 *   the server's zone.
 */
export function civilInZone(instant: Date, timeZone: string): CivilDateTime {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    if (part === undefined) {
      throw new Error(`Intl did not return a ${type} part for timezone ${timeZone}`);
    }
    return part.value;
  };

  const weekdayName = read("weekday");
  const weekday = WEEKDAY_INDEX[weekdayName];
  if (weekday === undefined) {
    throw new Error(`Unrecognised weekday part "${weekdayName}"`);
  }

  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    weekday,
    // `hour12: false` renders midnight as 24 in some ICU versions.
    hour: Number(read("hour")) % 24,
    minute: Number(read("minute")),
  };
}

/**
 * Minutes elapsed since school-local midnight.
 *
 * This is the scale operational hours and academic period boundaries are
 * expressed on.
 */
export function minutesOfDayInZone(instant: Date, timeZone: string): number {
  const civil = civilInZone(instant, timeZone);
  return civil.hour * 60 + civil.minute;
}

/** School-local weekday, 0 = Sunday … 6 = Saturday. */
export function weekdayInZone(instant: Date, timeZone: string): number {
  return civilInZone(instant, timeZone).weekday;
}

/** Whether an instant falls on a school-local Saturday or Sunday. */
export function isWeekendInZone(instant: Date, timeZone: string): boolean {
  const weekday = weekdayInZone(instant, timeZone);
  return weekday === 0 || weekday === 6;
}

/**
 * Parses an `HH:MM` civil time (as stored on `AcademicPeriod`) into minutes
 * since midnight.
 *
 * @throws Error on anything that is not a valid 24-hour `HH:MM` — a malformed
 *   period must fail loudly rather than silently become midnight.
 */
export function minutesFromClockTime(clock: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  if (!match) {
    throw new Error(`Invalid clock time "${clock}": expected HH:MM in 24-hour form`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}
