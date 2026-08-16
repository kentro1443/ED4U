import { splitCsvLine } from "../members/roster";
import type { Weekday } from "./timetable";

/**
 * Timetable import parsing.
 *
 * A timetable is a set of hard constraints, not a list of suggestions: a single
 * duplicated slot double-books a room or a teacher for a whole semester. The
 * import is therefore all-or-nothing, and the internal consistency checks
 * (same room twice in one period, same teacher twice, same class twice) run
 * here — before anything touches the database — so the file can be rejected
 * with the exact conflicting lines named.
 */

export const TIMETABLE_COLUMNS = [
  "class_code",
  "subject_code",
  "teacher_code",
  "room_code",
  "weekday",
  "period_code",
] as const;

export type TimetableColumn = (typeof TIMETABLE_COLUMNS)[number];

export interface TimetableImportRow {
  line: number;
  classCode: string;
  subjectCode: string;
  teacherCode: string;
  roomCode: string;
  weekday: Weekday;
  periodCode: string;
}

export interface TimetableIssue {
  line: number;
  column: TimetableColumn | "file";
  message: string;
}

export type TimetableParseResult =
  { ok: true; rows: TimetableImportRow[] } | { ok: false; issues: TimetableIssue[] };

const WEEKDAYS: Record<string, Weekday> = {
  MON: "MON",
  TUE: "TUE",
  WED: "WED",
  THU: "THU",
  FRI: "FRI",
  T2: "MON",
  T3: "TUE",
  T4: "WED",
  T5: "THU",
  T6: "FRI",
  "2": "MON",
  "3": "TUE",
  "4": "WED",
  "5": "THU",
  "6": "FRI",
};

const MAX_ROWS = 5000;

export function parseTimetableCsv(text: string): TimetableParseResult {
  const issues: TimetableIssue[] = [];
  const content = text.replace(/^\uFEFF/, "");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { ok: false, issues: [{ line: 0, column: "file", message: "Tệp rỗng." }] };
  }

  const header = splitCsvLine(lines[0] ?? "").map((column) => column.toLowerCase());
  const missing = TIMETABLE_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    return {
      ok: false,
      issues: [
        {
          line: 1,
          column: "file",
          message: `Thiếu cột bắt buộc: ${missing.join(", ")}. Cần đủ: ${TIMETABLE_COLUMNS.join(", ")}.`,
        },
      ],
    };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length === 0) {
    return {
      ok: false,
      issues: [{ line: 1, column: "file", message: "Tệp chỉ có dòng tiêu đề, không có dữ liệu." }],
    };
  }
  if (dataLines.length > MAX_ROWS) {
    return {
      ok: false,
      issues: [
        {
          line: 1,
          column: "file",
          message: `Tối đa ${MAX_ROWS} dòng mỗi lần nhập; tệp có ${dataLines.length} dòng.`,
        },
      ],
    };
  }

  const indexOf = (column: TimetableColumn) => header.indexOf(column);
  const rows: TimetableImportRow[] = [];

  dataLines.forEach((rawLine, offset) => {
    const line = offset + 2;
    const fields = splitCsvLine(rawLine);
    const classCode = (fields[indexOf("class_code")] ?? "").toUpperCase();
    const subjectCode = (fields[indexOf("subject_code")] ?? "").toUpperCase();
    const teacherCode = (fields[indexOf("teacher_code")] ?? "").toUpperCase();
    const roomCode = (fields[indexOf("room_code")] ?? "").toUpperCase();
    const rawWeekday = (fields[indexOf("weekday")] ?? "").toUpperCase();
    const periodCode = (fields[indexOf("period_code")] ?? "").toUpperCase();

    const required: Array<[TimetableColumn, string]> = [
      ["class_code", classCode],
      ["subject_code", subjectCode],
      ["teacher_code", teacherCode],
      ["room_code", roomCode],
      ["period_code", periodCode],
    ];
    for (const [column, value] of required) {
      if (!value) issues.push({ line, column, message: `Thiếu giá trị cho ${column}.` });
    }

    const weekday = WEEKDAYS[rawWeekday];
    if (!weekday) {
      issues.push({
        line,
        column: "weekday",
        message: `weekday "${rawWeekday || "(trống)"}" không hợp lệ. Dùng MON–FRI hoặc T2–T6.`,
      });
    }

    if (weekday && required.every(([, value]) => value)) {
      rows.push({ line, classCode, subjectCode, teacherCode, roomCode, weekday, periodCode });
    }
  });

  if (issues.length === 0) {
    issues.push(...findInternalConflicts(rows));
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, rows };
}

/**
 * Conflicts *within the file itself*. A room, a teacher and a class can each be
 * in exactly one place per slot; the database constraints would catch some of
 * this, but only after a partial write and with a message no administrator can
 * act on.
 */
export function findInternalConflicts(rows: readonly TimetableImportRow[]): TimetableIssue[] {
  const issues: TimetableIssue[] = [];
  const seen = new Map<string, number>();

  const check = (
    key: string,
    line: number,
    column: TimetableColumn,
    describe: (firstLine: number) => string,
  ) => {
    const first = seen.get(key);
    if (first !== undefined) {
      issues.push({ line, column, message: describe(first) });
    } else {
      seen.set(key, line);
    }
  };

  for (const row of rows) {
    const slot = `${row.weekday}|${row.periodCode}`;
    check(
      `room|${slot}|${row.roomCode}`,
      row.line,
      "room_code",
      (first) => `Phòng ${row.roomCode} đã được xếp ở dòng ${first} cho cùng tiết ${slot}.`,
    );
    check(
      `teacher|${slot}|${row.teacherCode}`,
      row.line,
      "teacher_code",
      (first) => `Giáo viên ${row.teacherCode} đã được xếp ở dòng ${first} cho cùng tiết ${slot}.`,
    );
    check(
      `class|${slot}|${row.classCode}`,
      row.line,
      "class_code",
      (first) => `Lớp ${row.classCode} đã có tiết ở dòng ${first} cho cùng tiết ${slot}.`,
    );
  }

  return issues;
}
