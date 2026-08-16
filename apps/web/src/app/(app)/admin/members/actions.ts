"use server";

import { randomInt, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { revalidatePath } from "next/cache";
import { parseRosterCsv, type RosterIssue } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/authz";

/**
 * Member provisioning.
 *
 * V1 has no email delivery, so provisioning produces a temporary password the
 * administrator reads out or prints. It is returned to the caller exactly once
 * and never stored in plaintext, and every provisioned account is forced to
 * change it at first login.
 */

const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const TEMP_LENGTH = 12;

/** Avoids look-alike characters: these passwords are read aloud and copied by hand. */
function generateTemporaryPassword(): string {
  let password = "";
  for (let i = 0; i < TEMP_LENGTH; i += 1) {
    password += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  }
  return `${password}!1`;
}

export interface ImportResult {
  ok: boolean;
  created: number;
  updated: number;
  issues: RosterIssue[];
  error?: string;
}

/**
 * Transactional roster import: one invalid row rejects the whole file.
 *
 * A partial import is worse than none — an administrator cannot tell which of
 * 800 rows landed, and re-running the file would be the only recovery. Parsing
 * validates every row first, and the writes then run inside a single
 * transaction so a database-level failure rolls back with them.
 */
export async function importRosterAction(formData: FormData): Promise<ImportResult> {
  const actor = await requirePermission("members.import");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, created: 0, updated: 0, issues: [], error: "Hãy chọn một tệp CSV." };
  }
  if (file.size > 2 * 1024 * 1024) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      issues: [],
      error: "Tệp vượt quá giới hạn 2 MB.",
    };
  }

  const parsed = parseRosterCsv(await file.text());
  if (!parsed.ok) {
    return { ok: false, created: 0, updated: 0, issues: parsed.issues };
  }

  try {
    const classes = await db.class.findMany({
      where: { tenantId: actor.tenantId },
      select: { id: true, code: true, name: true },
    });
    const classByLabel = new Map<string, string>();
    for (const klass of classes) {
      classByLabel.set(klass.code.toUpperCase(), klass.id);
      classByLabel.set(klass.name.toUpperCase(), klass.id);
    }

    // Unknown classes are a file error, not a silent null: assigning a student
    // to no class would quietly remove them from timetable and calendar scope.
    const classIssues: RosterIssue[] = [];
    for (const row of parsed.rows) {
      if (row.className && !classByLabel.has(row.className.toUpperCase())) {
        classIssues.push({
          line: row.line,
          column: "class",
          message: `Lớp "${row.className}" chưa tồn tại trong trường. Hãy tạo lớp trước khi nhập.`,
        });
      }
    }
    if (classIssues.length > 0) {
      return { ok: false, created: 0, updated: 0, issues: classIssues };
    }

    const codes = parsed.rows.map((row) => row.schoolMemberCode);
    const existing = await db.schoolMembership.findMany({
      where: { tenantId: actor.tenantId, schoolMemberCode: { in: codes } },
      select: { id: true, schoolMemberCode: true, userId: true },
    });
    const existingByCode = new Map(existing.map((m) => [m.schoolMemberCode, m]));

    let created = 0;
    let updated = 0;

    await db.$transaction(async (tx) => {
      for (const row of parsed.rows) {
        const classId = row.className
          ? (classByLabel.get(row.className.toUpperCase()) ?? null)
          : null;
        const match = existingByCode.get(row.schoolMemberCode);

        if (match) {
          // An existing member is corrected, never re-provisioned: re-issuing a
          // password on every import would invalidate working logins.
          await tx.user.update({
            where: { id: match.userId },
            data: { fullName: row.fullName },
          });
          await tx.schoolMembership.update({
            where: { id: match.id },
            data: { memberType: row.memberType, classId },
          });
          updated += 1;
          continue;
        }

        const passwordHash = await argon2.hash(generateTemporaryPassword(), {
          type: argon2.argon2id,
        });
        const user = await tx.user.create({
          data: {
            tenantId: actor.tenantId,
            fullName: row.fullName,
            passwordHash,
            mustChangePassword: true,
          },
        });
        await tx.schoolMembership.create({
          data: {
            tenantId: actor.tenantId,
            userId: user.id,
            schoolMemberCode: row.schoolMemberCode,
            memberType: row.memberType,
            membershipStatus: "ACTIVE",
            classId,
            startedAt: new Date(),
          },
        });
        await tx.userRoleAssignment.create({
          data: {
            userId: user.id,
            role: row.memberType === "TEACHER" ? "TEACHER" : "STUDENT",
            assignedBy: actor.userId,
          },
        });
        created += 1;
      }

      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "MEMBER_ROSTER_IMPORT",
          entityType: "SchoolMembership",
          entityId: actor.tenantId,
          requestId: randomUUID(),
          afterJson: {
            filename: file.name,
            rows: parsed.rows.length,
            created,
            updated,
          },
        },
      });
    });

    revalidatePath("/admin/members");
    return { ok: true, created, updated, issues: [] };
  } catch (error) {
    console.error("[members] roster import failed", error);
    return {
      ok: false,
      created: 0,
      updated: 0,
      issues: [],
      error: "Không thể nhập danh sách. Toàn bộ thay đổi đã được hoàn tác.",
    };
  }
}

export async function createMemberAction(formData: FormData) {
  const actor = await requirePermission("members.manage");

  const fullName = String(formData.get("fullName") ?? "").trim();
  const schoolMemberCode = String(formData.get("schoolMemberCode") ?? "")
    .trim()
    .toUpperCase();
  const memberType = String(formData.get("memberType") ?? "STUDENT");
  const classId = String(formData.get("classId") ?? "").trim();

  try {
    if (fullName.length < 2 || fullName.length > 120) {
      throw new Error("Họ tên phải có 2–120 ký tự.");
    }
    if (!/^[A-Z]{2}\d{6}$/.test(schoolMemberCode)) {
      throw new Error("Mã thành viên phải gồm 2 chữ cái và 6 chữ số, ví dụ HS000123.");
    }
    if (!["STUDENT", "TEACHER", "STAFF"].includes(memberType)) {
      throw new Error("Loại thành viên không hợp lệ.");
    }
    if (memberType === "STUDENT" && !classId) {
      throw new Error("Học sinh bắt buộc phải có lớp.");
    }

    const duplicate = await db.schoolMembership.findFirst({
      where: { tenantId: actor.tenantId, schoolMemberCode },
      select: { id: true },
    });
    if (duplicate) {
      throw new Error(`Mã ${schoolMemberCode} đã được sử dụng trong trường.`);
    }
    if (classId) {
      const klass = await db.class.findFirst({
        where: { id: classId, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!klass) throw new Error("Lớp không thuộc trường hiện tại.");
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: actor.tenantId,
          fullName,
          passwordHash,
          mustChangePassword: true,
        },
      });
      await tx.schoolMembership.create({
        data: {
          tenantId: actor.tenantId,
          userId: user.id,
          schoolMemberCode,
          memberType: memberType as "STUDENT" | "TEACHER" | "STAFF",
          membershipStatus: "ACTIVE",
          classId: classId || null,
          startedAt: new Date(),
        },
      });
      await tx.userRoleAssignment.create({
        data: {
          userId: user.id,
          role: memberType === "TEACHER" ? "TEACHER" : "STUDENT",
          assignedBy: actor.userId,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "MEMBER_CREATE",
          entityType: "SchoolMembership",
          entityId: user.id,
          requestId: randomUUID(),
          afterJson: { fullName, schoolMemberCode, memberType },
        },
      });
    });

    revalidatePath("/admin/members");
    return { ok: true as const, schoolMemberCode, temporaryPassword };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể tạo tài khoản.",
    };
  }
}

export async function resetMemberPasswordAction(membershipId: string) {
  const actor = await requirePermission("password.reset");
  try {
    const membership = await db.schoolMembership.findFirst({
      where: { id: membershipId, tenantId: actor.tenantId },
      select: { id: true, userId: true, schoolMemberCode: true },
    });
    if (!membership) throw new Error("Không tìm thấy thành viên trong trường này.");

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: membership.userId },
        data: { passwordHash, mustChangePassword: true },
      });
      // Every existing session is revoked: a reset exists precisely because the
      // account may be compromised, and leaving old sessions alive would defeat it.
      await tx.session.updateMany({
        where: { userId: membership.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "MEMBER_PASSWORD_RESET",
          entityType: "User",
          entityId: membership.userId,
          requestId: randomUUID(),
          afterJson: {
            schoolMemberCode: membership.schoolMemberCode,
            sessionsRevoked: true,
          },
        },
      });
    });

    revalidatePath("/admin/members");
    return { ok: true as const, schoolMemberCode: membership.schoolMemberCode, temporaryPassword };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể đặt lại mật khẩu.",
    };
  }
}

export async function setMembershipStatusAction(membershipId: string, status: string) {
  const actor = await requirePermission("members.manage");
  try {
    if (!["ACTIVE", "GRADUATED", "LEFT_SCHOOL", "SUSPENDED"].includes(status)) {
      throw new Error("Trạng thái không hợp lệ.");
    }
    const membership = await db.schoolMembership.findFirst({
      where: { id: membershipId, tenantId: actor.tenantId },
      select: { id: true, userId: true, membershipStatus: true, schoolMemberCode: true },
    });
    if (!membership) throw new Error("Không tìm thấy thành viên trong trường này.");
    if (membership.userId === actor.userId) {
      throw new Error("Không thể tự thay đổi trạng thái tài khoản của chính mình.");
    }

    await db.$transaction(async (tx) => {
      await tx.schoolMembership.update({
        where: { id: membership.id },
        data: {
          membershipStatus: status as "ACTIVE" | "GRADUATED" | "LEFT_SCHOOL" | "SUSPENDED",
          endedAt: status === "ACTIVE" ? null : new Date(),
        },
      });
      // A member who can no longer log in must not keep a live session.
      if (status === "SUSPENDED" || status === "LEFT_SCHOOL") {
        await tx.session.updateMany({
          where: { userId: membership.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "MEMBER_STATUS_CHANGE",
          entityType: "SchoolMembership",
          entityId: membership.id,
          requestId: randomUUID(),
          beforeJson: { membershipStatus: membership.membershipStatus },
          afterJson: {
            membershipStatus: status,
            schoolMemberCode: membership.schoolMemberCode,
          },
        },
      });
    });

    revalidatePath("/admin/members");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể cập nhật trạng thái.",
    };
  }
}
