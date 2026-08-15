import { describe, expect, it } from "vitest";
import {
  civilDateTimeToInstant,
  civilInZone,
  periodOccurrence,
  schoolWeekMonday,
} from "../src/academic/timezone";

describe("school-local calendar conversion", () => {
  it("converts a Vietnam civil time to the correct UTC instant", () => {
    const instant = civilDateTimeToInstant(
      { year: 2026, month: 8, day: 17, hour: 7, minute: 30 },
      "Asia/Ho_Chi_Minh",
    );
    expect(instant.toISOString()).toBe("2026-08-17T00:30:00.000Z");
  });

  it("finds Monday in school time even when the instant is Sunday in UTC", () => {
    // 2026-08-16T18:30Z is already Monday 01:30 in Vietnam.
    const monday = schoolWeekMonday(new Date("2026-08-16T18:30:00Z"), "Asia/Ho_Chi_Minh");
    expect(monday).toEqual({ year: 2026, month: 8, day: 17 });
  });

  it("resolves Monday P1 and Friday P4 without using host-local time", () => {
    const anchor = new Date("2026-08-17T04:00:00Z");
    const monday = periodOccurrence({
      anchor,
      weekday: "MON",
      startTime: "07:30",
      endTime: "08:15",
      timeZone: "Asia/Ho_Chi_Minh",
    });
    const friday = periodOccurrence({
      anchor,
      weekday: "FRI",
      startTime: "10:10",
      endTime: "10:55",
      timeZone: "Asia/Ho_Chi_Minh",
    });
    expect(monday.localDate).toBe("2026-08-17");
    expect(monday.startAt.toISOString()).toBe("2026-08-17T00:30:00.000Z");
    expect(friday.localDate).toBe("2026-08-21");
    expect(friday.startAt.toISOString()).toBe("2026-08-21T03:10:00.000Z");
    expect(civilInZone(friday.endAt, "Asia/Ho_Chi_Minh").hour).toBe(10);
  });
});
