import { ValidationError, err, ok, type Result } from "../errors";

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface PeriodDef {
  id: string;
  code: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
}

export interface TimetableEntryDraft {
  rowNumber: number;
  academicYearId: string;
  semesterId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId: string;
  weekday: string;
  periodId: string;
}

export interface TimetableRefs {
  classIds: ReadonlySet<string>;
  subjectIds: ReadonlySet<string>;
  teacherIds: ReadonlySet<string>;
  roomIds: ReadonlySet<string>;
  periodIds: ReadonlySet<string>;
  yearIds: ReadonlySet<string>;
  semesterIds: ReadonlySet<string>;
}

export interface ImportRowError {
  rowNumber: number;
  field?: string;
  message: string;
  code: string;
}

export interface ValidatedTimetableImport {
  entries: Omit<TimetableEntryDraft, "rowNumber">[];
}

function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}

/**
 * Transactional timetable import validation. Either every row is accepted or
 * the entire file is rejected with row-numbered errors. Never partial-apply.
 */
export function validateTimetableImport(
  rows: readonly TimetableEntryDraft[],
  refs: TimetableRefs,
): Result<ValidatedTimetableImport, ValidationError> {
  const errors: ImportRowError[] = [];
  const teacherSlot = new Map<string, number>();
  const roomSlot = new Map<string, number>();
  const classSlot = new Map<string, number>();
  const seenExact = new Map<string, number>();

  for (const row of rows) {
    const n = row.rowNumber;
    if (!refs.yearIds.has(row.academicYearId)) {
      errors.push({
        rowNumber: n,
        field: "academicYearId",
        code: "INVALID_YEAR",
        message: "Năm học không tồn tại.",
      });
    }
    if (!refs.semesterIds.has(row.semesterId)) {
      errors.push({
        rowNumber: n,
        field: "semesterId",
        code: "INVALID_SEMESTER",
        message: "Học kỳ không tồn tại.",
      });
    }
    if (!refs.classIds.has(row.classId)) {
      errors.push({
        rowNumber: n,
        field: "classId",
        code: "INVALID_CLASS",
        message: "Lớp không tồn tại.",
      });
    }
    if (!refs.subjectIds.has(row.subjectId)) {
      errors.push({
        rowNumber: n,
        field: "subjectId",
        code: "INVALID_SUBJECT",
        message: "Môn học không tồn tại.",
      });
    }
    if (!refs.teacherIds.has(row.teacherId)) {
      errors.push({
        rowNumber: n,
        field: "teacherId",
        code: "INVALID_TEACHER",
        message: "Giáo viên không tồn tại.",
      });
    }
    if (!refs.roomIds.has(row.roomId)) {
      errors.push({
        rowNumber: n,
        field: "roomId",
        code: "INVALID_ROOM",
        message: "Phòng không tồn tại.",
      });
    }
    if (!refs.periodIds.has(row.periodId)) {
      errors.push({
        rowNumber: n,
        field: "periodId",
        code: "INVALID_PERIOD",
        message: "Tiết học không tồn tại.",
      });
    }
    if (!isWeekday(row.weekday)) {
      errors.push({
        rowNumber: n,
        field: "weekday",
        code: "INVALID_WEEKDAY",
        message: "Chỉ hỗ trợ thứ Hai–Thứ Sáu. Không có tuần A/B.",
      });
    }

    const exactKey = [
      row.academicYearId,
      row.semesterId,
      row.classId,
      row.subjectId,
      row.teacherId,
      row.roomId,
      row.weekday,
      row.periodId,
    ].join("|");
    const prevExact = seenExact.get(exactKey);
    if (prevExact !== undefined) {
      errors.push({
        rowNumber: n,
        code: "DUPLICATE_ROW",
        message: `Dòng trùng với dòng ${prevExact}.`,
      });
    } else {
      seenExact.set(exactKey, n);
    }

    const teacherKey = `${row.academicYearId}|${row.semesterId}|${row.teacherId}|${row.weekday}|${row.periodId}`;
    const prevTeacher = teacherSlot.get(teacherKey);
    if (prevTeacher !== undefined) {
      errors.push({
        rowNumber: n,
        code: "TEACHER_DOUBLE_BOOK",
        message: `Giáo viên bị trùng tiết với dòng ${prevTeacher}.`,
      });
    } else {
      teacherSlot.set(teacherKey, n);
    }

    const roomKey = `${row.academicYearId}|${row.semesterId}|${row.roomId}|${row.weekday}|${row.periodId}`;
    const prevRoom = roomSlot.get(roomKey);
    if (prevRoom !== undefined) {
      errors.push({
        rowNumber: n,
        code: "ROOM_DOUBLE_BOOK",
        message: `Phòng bị trùng tiết với dòng ${prevRoom}.`,
      });
    } else {
      roomSlot.set(roomKey, n);
    }

    const classKey = `${row.academicYearId}|${row.semesterId}|${row.classId}|${row.weekday}|${row.periodId}`;
    const prevClass = classSlot.get(classKey);
    if (prevClass !== undefined) {
      errors.push({
        rowNumber: n,
        code: "CLASS_DOUBLE_BOOK",
        message: `Lớp bị trùng tiết với dòng ${prevClass}.`,
      });
    } else {
      classSlot.set(classKey, n);
    }
  }

  if (errors.length > 0) {
    return err(
      new ValidationError("Toàn bộ file thời khóa biểu bị từ chối.", {
        errors,
        rejected: true,
        transactional: true,
      }),
    );
  }

  return ok({
    entries: rows.map(({ rowNumber: _row, ...rest }) => rest),
  });
}

export function teacherRoomCollisionKey(
  yearId: string,
  semesterId: string,
  weekday: string,
  periodId: string,
  teacherId: string,
  roomId: string,
): { teacher: string; room: string } {
  return {
    teacher: `${yearId}|${semesterId}|${teacherId}|${weekday}|${periodId}`,
    room: `${yearId}|${semesterId}|${roomId}|${weekday}|${periodId}`,
  };
}
