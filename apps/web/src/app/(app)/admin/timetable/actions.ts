"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { parseTimetableCsv, type TimetableIssue } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/authz";

/**
 * Timetable import.
 *
 * The file replaces the timetable for one semester as a single transaction. A
 * partial timetable is not a smaller timetable — it is a broken one, because
 * the calendar, the room occupancy adapter and the Facility Engine all read it
 * as the complete picture of where a class, teacher and room are supposed to be.
 */

export interface TimetableImportResult {
  ok: boolean;
  imported: number;
  replaced: number;
  issues: TimetableIssue[];
  error?: string;
}

export async function importTimetableAction(formData: FormData): Promise<TimetableImportResult> {
  const actor = await requirePermission("timetable.import");

  const file = formData.get("file");
  const semesterId = String(formData.get("semesterId") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, imported: 0, replaced: 0, issues: [], error: "Hãy chọn một tệp CSV." };
  }
  if (file.size > 2 * 1024 * 1024) {
    return {
      ok: false,
      imported: 0,
      replaced: 0,
      issues: [],
      error: "Tệp vượt quá giới hạn 2 MB.",
    };
  }
  if (!semesterId) {
    return { ok: false, imported: 0, replaced: 0, issues: [], error: "Hãy chọn học kỳ." };
  }

  const parsed = parseTimetableCsv(await file.text());
  if (!parsed.ok) {
    return { ok: false, imported: 0, replaced: 0, issues: parsed.issues };
  }

  try {
    const semester = await db.semester.findFirst({
      where: { id: semesterId, year: { tenantId: actor.tenantId } },
      include: { year: { select: { id: true, name: true } } },
    });
    if (!semester) {
      return {
        ok: false,
        imported: 0,
        replaced: 0,
        issues: [],
        error: "Học kỳ không thuộc trường hiện tại.",
      };
    }

    const [classes, subjects, rooms, periods, teachers] = await Promise.all([
      db.class.findMany({ where: { tenantId: actor.tenantId }, select: { id: true, code: true } }),
      db.subject.findMany({
        where: { tenantId: actor.tenantId },
        select: { id: true, code: true },
      }),
      db.room.findMany({ where: { tenantId: actor.tenantId }, select: { id: true, code: true } }),
      db.academicPeriod.findMany({
        where: { tenantId: actor.tenantId },
        select: { id: true, code: true },
      }),
      db.schoolMembership.findMany({
        where: { tenantId: actor.tenantId, memberType: "TEACHER" },
        select: { userId: true, schoolMemberCode: true },
      }),
    ]);

    const classByCode = new Map(classes.map((c) => [c.code.toUpperCase(), c.id]));
    const subjectByCode = new Map(subjects.map((s) => [s.code.toUpperCase(), s.id]));
    const roomByCode = new Map(rooms.map((r) => [r.code.toUpperCase(), r.id]));
    const periodByCode = new Map(periods.map((p) => [p.code.toUpperCase(), p.id]));
    const teacherByCode = new Map(
      teachers.map((t) => [t.schoolMemberCode.toUpperCase(), t.userId]),
    );

    // Unresolved references are reported per line and reject the file. Creating
    // the missing class or subject on the fly would let a typo silently spawn a
    // duplicate that then diverges from the real one.
    const issues: TimetableIssue[] = [];
    for (const row of parsed.rows) {
      if (!classByCode.has(row.classCode)) {
        issues.push({
          line: row.line,
          column: "class_code",
          message: `Lớp ${row.classCode} chưa tồn tại trong trường.`,
        });
      }
      if (!subjectByCode.has(row.subjectCode)) {
        issues.push({
          line: row.line,
          column: "subject_code",
          message: `Môn ${row.subjectCode} chưa tồn tại trong trường.`,
        });
      }
      if (!roomByCode.has(row.roomCode)) {
        issues.push({
          line: row.line,
          column: "room_code",
          message: `Phòng ${row.roomCode} chưa tồn tại trong trường.`,
        });
      }
      if (!periodByCode.has(row.periodCode)) {
        issues.push({
          line: row.line,
          column: "period_code",
          message: `Tiết ${row.periodCode} chưa được cấu hình.`,
        });
      }
      if (!teacherByCode.has(row.teacherCode)) {
        issues.push({
          line: row.line,
          column: "teacher_code",
          message: `Không tìm thấy giáo viên có mã ${row.teacherCode}.`,
        });
      }
    }
    if (issues.length > 0) {
      return { ok: false, imported: 0, replaced: 0, issues };
    }

    let replaced = 0;
    await db.$transaction(async (tx) => {
      const removed = await tx.timetableEntry.deleteMany({
        where: { tenantId: actor.tenantId, semesterId: semester.id },
      });
      replaced = removed.count;

      await tx.timetableEntry.createMany({
        data: parsed.rows.map((row) => ({
          tenantId: actor.tenantId,
          academicYearId: semester.year.id,
          semesterId: semester.id,
          classId: classByCode.get(row.classCode) as string,
          subjectId: subjectByCode.get(row.subjectCode) as string,
          teacherId: teacherByCode.get(row.teacherCode) as string,
          roomId: roomByCode.get(row.roomCode) as string,
          weekday: row.weekday,
          periodId: periodByCode.get(row.periodCode) as string,
        })),
      });

      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "TIMETABLE_IMPORT",
          entityType: "TimetableEntry",
          entityId: semester.id,
          requestId: randomUUID(),
          beforeJson: { semester: semester.name, entriesRemoved: replaced },
          afterJson: {
            filename: file.name,
            semester: semester.name,
            year: semester.year.name,
            entriesCreated: parsed.rows.length,
          },
        },
      });
    });

    revalidatePath("/admin/timetable");
    revalidatePath("/calendar");
    revalidatePath("/rooms/schedule");
    return { ok: true, imported: parsed.rows.length, replaced, issues: [] };
  } catch (error) {
    console.error("[timetable] import failed", error);
    return {
      ok: false,
      imported: 0,
      replaced: 0,
      issues: [],
      error: "Không thể nhập thời khóa biểu. Toàn bộ thay đổi đã được hoàn tác.",
    };
  }
}
