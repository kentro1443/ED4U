import { describe, expect, it } from "vitest";
import {
  civilInZone,
  isWeekendInZone,
  minutesFromClockTime,
  minutesOfDayInZone,
  weekdayInZone,
  withinOperationalHours,
} from "../src/index";

const SCHOOL_TZ = "Asia/Ho_Chi_Minh"; // UTC+7, no DST.
const SCHOOL_HOURS = { startMinutes: 7 * 60, endMinutes: 20 * 60 };

describe("civil time in a zone", () => {
  it("reads the school's wall clock, not UTC", () => {
    // 2026-08-17 is a Monday. 02:00Z is 09:00 in Ho Chi Minh City.
    const instant = new Date("2026-08-17T02:00:00Z");
    expect(civilInZone(instant, SCHOOL_TZ)).toEqual({
      year: 2026,
      month: 8,
      day: 17,
      weekday: 1,
      hour: 9,
      minute: 0,
    });
    expect(minutesOfDayInZone(instant, SCHOOL_TZ)).toBe(9 * 60);
  });

  it("rolls the civil date forward across the UTC day boundary", () => {
    // Sunday 18:00Z is already Monday 01:00 at the school.
    const instant = new Date("2026-08-16T18:00:00Z");
    const civil = civilInZone(instant, SCHOOL_TZ);
    expect(civil.day).toBe(17);
    expect(civil.weekday).toBe(1);
    expect(civil.hour).toBe(1);
  });

  it("renders school-local midnight as hour 0", () => {
    // 17:00Z Sunday is 00:00 Monday at the school.
    expect(minutesOfDayInZone(new Date("2026-08-16T17:00:00Z"), SCHOOL_TZ)).toBe(0);
  });

  it("respects DST in zones that have it", () => {
    const winter = new Date("2026-01-15T12:00:00Z");
    const summer = new Date("2026-07-15T12:00:00Z");
    expect(civilInZone(winter, "Europe/London").hour).toBe(12);
    expect(civilInZone(summer, "Europe/London").hour).toBe(13);
  });

  it("rejects an unknown timezone rather than silently falling back", () => {
    expect(() => civilInZone(new Date(), "Mars/Olympus_Mons")).toThrow();
  });
});

describe("weekday in a zone", () => {
  it("classifies a Friday-evening-UTC instant as the school's Saturday", () => {
    // 2026-08-21 is a Friday. 18:00Z is Saturday 01:00 at the school.
    const instant = new Date("2026-08-21T18:00:00Z");
    expect(weekdayInZone(instant, "UTC")).toBe(5);
    expect(weekdayInZone(instant, SCHOOL_TZ)).toBe(6);
    expect(isWeekendInZone(instant, SCHOOL_TZ)).toBe(true);
  });
});

describe("operational hours", () => {
  /**
   * This is the bug the audit found. A 14:00–16:00 event at a UTC+7 school is
   * stored as 07:00–09:00Z; the old implementation read the UTC hours and
   * concluded 07:00–09:00, which happens to pass. Shift the same event two
   * hours later and the UTC reading crosses 20:00 while the school clock says
   * 16:00–18:00 — comfortably inside opening hours.
   */
  it("accepts a school-afternoon booking that UTC arithmetic would reject", () => {
    const interval = {
      startAt: new Date("2026-08-17T09:00:00Z"), // 16:00 school time
      endAt: new Date("2026-08-17T11:00:00Z"), // 18:00 school time
    };
    expect(withinOperationalHours(interval, SCHOOL_HOURS, SCHOOL_TZ)).toBe(true);
    // Same instants, read as UTC: 09:00–11:00, also inside the window — which
    // is exactly why the old code looked correct in some cases and not others.
    expect(withinOperationalHours(interval, SCHOOL_HOURS, "UTC")).toBe(true);
  });

  it("rejects an evening booking that only UTC arithmetic thinks is in hours", () => {
    const interval = {
      startAt: new Date("2026-08-17T13:00:00Z"), // 20:00 school time — closed
      endAt: new Date("2026-08-17T14:00:00Z"), // 21:00 school time
    };
    expect(withinOperationalHours(interval, SCHOOL_HOURS, SCHOOL_TZ)).toBe(false);
    // Read as UTC the same booking is 13:00–14:00 and passes. This is the
    // seven-hour error the prototype shipped.
    expect(withinOperationalHours(interval, SCHOOL_HOURS, "UTC")).toBe(true);
  });

  it("rejects an early-morning booking before the school opens", () => {
    const interval = {
      startAt: new Date("2026-08-16T23:00:00Z"), // 06:00 school time
      endAt: new Date("2026-08-17T00:00:00Z"), // 07:00 school time
    };
    expect(withinOperationalHours(interval, SCHOOL_HOURS, SCHOOL_TZ)).toBe(false);
  });

  it("rejects a weekend booking measured in school-local time", () => {
    // Friday 18:00Z is Saturday at the school even though UTC still says Friday.
    const interval = {
      startAt: new Date("2026-08-21T18:00:00Z"),
      endAt: new Date("2026-08-21T19:00:00Z"),
    };
    expect(withinOperationalHours(interval, SCHOOL_HOURS, SCHOOL_TZ)).toBe(false);
  });

  it("rejects an interval that crosses school-local midnight", () => {
    const interval = {
      startAt: new Date("2026-08-17T10:00:00Z"), // Mon 17:00 school time
      endAt: new Date("2026-08-17T18:00:00Z"), // Tue 01:00 school time
    };
    expect(withinOperationalHours(interval, SCHOOL_HOURS, SCHOOL_TZ)).toBe(false);
  });
});

describe("academic period clock times", () => {
  it("parses the HH:MM form AcademicPeriod stores", () => {
    expect(minutesFromClockTime("07:30")).toBe(450);
    expect(minutesFromClockTime("15:25")).toBe(925);
    expect(minutesFromClockTime("00:00")).toBe(0);
  });

  it("throws on malformed input rather than defaulting to midnight", () => {
    for (const bad of ["7:30", "24:00", "12:60", "", "noon"]) {
      expect(() => minutesFromClockTime(bad), bad).toThrow();
    }
  });
});
