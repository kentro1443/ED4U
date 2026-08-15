import { describe, expect, it } from "vitest";
import {
  filterVisible,
  projectCalendar,
  timetableDuplicatedAsEvents,
  validateTimetableImport,
  type TimetableEntryDraft,
  type TimetableRefs,
  type RawCalendarSource,
} from "../src/index";

const refs: TimetableRefs = {
  classIds: new Set(["c1"]),
  subjectIds: new Set(["s1"]),
  teacherIds: new Set(["gv1", "gv2"]),
  roomIds: new Set(["r1", "r2"]),
  periodIds: new Set(["p1", "p2"]),
  yearIds: new Set(["y1"]),
  semesterIds: new Set(["sem1"]),
};

function row(
  over: Partial<TimetableEntryDraft> & Pick<TimetableEntryDraft, "rowNumber">,
): TimetableEntryDraft {
  return {
    academicYearId: "y1",
    semesterId: "sem1",
    classId: "c1",
    subjectId: "s1",
    teacherId: "gv1",
    roomId: "r1",
    weekday: "MON",
    periodId: "p1",
    ...over,
  };
}

describe("transactional timetable import", () => {
  it("accepts a clean file", () => {
    const r = validateTimetableImport(
      [row({ rowNumber: 2 }), row({ rowNumber: 3, periodId: "p2", roomId: "r2" })],
      refs,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.entries).toHaveLength(2);
  });

  it("rejects the entire file on teacher double-book with row numbers", () => {
    const r = validateTimetableImport(
      [row({ rowNumber: 2 }), row({ rowNumber: 5, roomId: "r2" })],
      refs,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.details.transactional).toBe(true);
      const errors = r.error.details.errors as { rowNumber: number; code: string }[];
      expect(errors.some((e) => e.code === "TEACHER_DOUBLE_BOOK" && e.rowNumber === 5)).toBe(true);
    }
  });

  it("rejects room double-book, invalid refs, and duplicates", () => {
    const r = validateTimetableImport(
      [
        row({ rowNumber: 2 }),
        row({ rowNumber: 3, teacherId: "gv2" }),
        row({
          rowNumber: 4,
          classId: "nope",
          teacherId: "missing",
          roomId: "gone",
          periodId: "p2",
        }),
        row({ rowNumber: 5 }),
      ],
      refs,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const codes = (r.error.details.errors as { code: string }[]).map((e) => e.code);
      expect(codes).toContain("ROOM_DOUBLE_BOOK");
      expect(codes).toContain("INVALID_CLASS");
      expect(codes).toContain("INVALID_TEACHER");
      expect(codes).toContain("INVALID_ROOM");
      expect(codes).toContain("DUPLICATE_ROW");
    }
  });
});

describe("calendar projection", () => {
  it("projects timetable without duplicating it as an event row", () => {
    const sources: RawCalendarSource[] = [
      {
        id: "tt-1",
        source: "TIMETABLE",
        title: "Toán 10A1",
        startAt: new Date("2026-08-17T07:30:00Z"),
        endAt: new Date("2026-08-17T08:15:00Z"),
        visibility: "CLASS",
        classId: "c1",
        persistedEventRow: false,
      },
      {
        id: "ev-1",
        source: "SCHOOL_EVENT",
        title: "Họp phụ huynh",
        startAt: new Date("2026-08-18T09:00:00Z"),
        endAt: new Date("2026-08-18T10:00:00Z"),
        visibility: "SCHOOL",
        persistedEventRow: true,
      },
    ];
    const items = projectCalendar(sources);
    expect(timetableDuplicatedAsEvents(items)).toBe(false);
    expect(items.find((i) => i.source === "TIMETABLE")?.persistedEventRow).toBe(false);
    expect(items.find((i) => i.source === "SCHOOL_EVENT")?.persistedEventRow).toBe(true);
  });

  it("honors PRIVATE visibility", () => {
    const sources: RawCalendarSource[] = [
      {
        id: "ap-1",
        source: "APPOINTMENT",
        title: "Gặp GV Toán",
        startAt: new Date("2026-08-17T15:00:00Z"),
        endAt: new Date("2026-08-17T15:30:00Z"),
        visibility: "PRIVATE",
        studentId: "stu",
        teacherId: "tea",
        persistedEventRow: false,
      },
    ];
    const visible = filterVisible(sources, {
      userId: "other",
      roles: ["STUDENT"],
      classId: "c1",
      grade: "10",
      clubIds: [],
    });
    expect(visible).toHaveLength(0);
    const owner = filterVisible(sources, {
      userId: "stu",
      roles: ["STUDENT"],
      classId: "c1",
      grade: "10",
      clubIds: [],
    });
    expect(owner).toHaveLength(1);
  });
});
