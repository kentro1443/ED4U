"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { acceptTransfer, can, transitionApplication } from "@ed4u/domain";
import { db } from "@/lib/db";
import { assertTenant, requireActor, requirePermission } from "@/lib/authz";
import { deletePrivateFile, savePrivatePdf } from "@/lib/files/privateStorage";
import { classifyTeacherNeed, routeTeachers } from "@/lib/teacher/routing";

export async function suggestTeachersAction(rawText: string) {
  const actor = await requireActor();
  if (!can(actor, "application.create") && !can(actor, "appointment.create")) {
    return { ok: false as const, error: "Bạn không có quyền dùng chức năng điều phối giáo viên." };
  }
  if (!rawText.trim()) return { ok: false as const, error: "Hãy mô tả nhu cầu trước." };
  const result = await routeTeachers(db, {
    tenantId: actor.tenantId,
    rawText: rawText.trim(),
    limit: 5,
  });
  return { ok: true as const, ...result };
}

async function ensureEligibleTeacher(tenantId: string, teacherId: string) {
  const profile = await db.teacherProfile.findFirst({
    where: {
      tenantId,
      userId: teacherId,
      user: {
        roles: { some: { role: "TEACHER" } },
        memberships: {
          some: { tenantId, memberType: "TEACHER", membershipStatus: "ACTIVE" },
        },
      },
    },
    include: { user: true },
  });
  if (!profile) throw new Error("Giáo viên không còn đủ điều kiện nhận yêu cầu.");
  return profile;
}

export async function submitApplicationAction(formData: FormData) {
  const actor = await requirePermission("application.create");
  if (actor.memberType !== "STUDENT" || actor.membershipStatus !== "ACTIVE") {
    return { ok: false as const, error: "Chỉ học sinh đang theo học mới được nộp đơn." };
  }
  const rawText = String(formData.get("rawText") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "");
  const file = formData.get("file");
  if (rawText.length < 5) return { ok: false as const, error: "Hãy mô tả nhu cầu rõ hơn." };
  if (!teacherId) return { ok: false as const, error: "Hãy chọn giáo viên tiếp nhận." };
  if (!(file instanceof File)) return { ok: false as const, error: "Hãy tải lên tệp PDF đã điền." };

  try {
    const teacher = await ensureEligibleTeacher(actor.tenantId, teacherId);
    const stored = await savePrivatePdf(db, {
      tenantId: actor.tenantId,
      userId: actor.userId,
      file,
    });
    try {
      const classification = classifyTeacherNeed(rawText);
      const application = await db.$transaction(async (tx) => {
        const created = await tx.application.create({
          data: {
            tenantId: actor.tenantId,
            studentId: actor.userId,
            rawRequestText: rawText,
            classifiedCategory: classification.category,
            currentTeacherId: teacherId,
            status: "SUBMITTED",
            description: description || null,
            latestSubmissionVersion: 1,
            versions: {
              create: {
                versionNumber: 1,
                fileId: stored.id,
                submittedBy: actor.userId,
              },
            },
          },
        });
        await tx.notification.create({
          data: {
            tenantId: actor.tenantId,
            userId: teacherId,
            type: "APPLICATION_SUBMITTED",
            title: "Có đơn học sinh mới",
            body: `${actor.schoolMemberCode}: ${rawText.slice(0, 140)}`,
            entityType: "Application",
            entityId: created.id,
          },
        });
        await tx.auditEvent.create({
          data: {
            tenantId: actor.tenantId,
            actorId: actor.userId,
            action: "APPLICATION_SUBMIT",
            entityType: "Application",
            entityId: created.id,
            requestId: randomUUID(),
            afterJson: {
              teacherId,
              category: classification.category,
              fileId: stored.id,
              version: 1,
            },
          },
        });
        return created;
      });
      revalidatePath("/applications");
      return {
        ok: true as const,
        applicationId: application.id,
        teacherName: teacher.user.fullName,
      };
    } catch (error) {
      await db.storedFile.delete({ where: { id: stored.id } }).catch(() => undefined);
      await deletePrivateFile(stored.storageKey).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể nộp đơn.",
    };
  }
}

export async function submitApplicationVersionAction(applicationId: string, formData: FormData) {
  const actor = await requirePermission("application.create");
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "Hãy chọn tệp PDF." };
  const application = await db.application.findFirst({
    where: { id: applicationId, tenantId: actor.tenantId, studentId: actor.userId },
  });
  if (!application)
    return { ok: false as const, error: "Không tìm thấy đơn thuộc tài khoản của bạn." };
  if (!["NEEDS_MORE_INFO", "DRAFT"].includes(application.status)) {
    return { ok: false as const, error: "Đơn hiện không nhận thêm phiên bản." };
  }

  try {
    const stored = await savePrivatePdf(db, {
      tenantId: actor.tenantId,
      userId: actor.userId,
      file,
    });
    try {
      const nextVersion = (application.latestSubmissionVersion ?? 0) + 1;
      await db.$transaction(async (tx) => {
        await tx.applicationSubmissionVersion.create({
          data: {
            applicationId,
            versionNumber: nextVersion,
            fileId: stored.id,
            submittedBy: actor.userId,
          },
        });
        await tx.application.update({
          where: { id: applicationId },
          data: { status: "SUBMITTED", latestSubmissionVersion: nextVersion, reviewNote: null },
        });
        await tx.notification.create({
          data: {
            tenantId: actor.tenantId,
            userId: application.currentTeacherId,
            type: "APPLICATION_RESUBMITTED",
            title: "Học sinh đã nộp phiên bản mới",
            body: `Phiên bản ${nextVersion} đã sẵn sàng để review.`,
            entityType: "Application",
            entityId: applicationId,
          },
        });
      });
      revalidatePath("/applications");
      return { ok: true as const, version: nextVersion };
    } catch (error) {
      await db.storedFile.delete({ where: { id: stored.id } }).catch(() => undefined);
      await deletePrivateFile(stored.storageKey).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể nộp phiên bản mới.",
    };
  }
}

export async function reviewApplicationAction(input: {
  applicationId: string;
  to: "IN_REVIEW" | "NEEDS_MORE_INFO" | "APPROVED" | "REJECTED";
  note?: string;
}) {
  const actor = await requirePermission("application.review");
  try {
    const application = await db.application.findUnique({ where: { id: input.applicationId } });
    if (!application) throw new Error("Không tìm thấy đơn.");
    assertTenant(actor, application.tenantId);
    if (!actor.roles.includes("SCHOOL_ADMIN") && application.currentTeacherId !== actor.userId) {
      throw new Error("Bạn không phải giáo viên đang phụ trách đơn này.");
    }
    const note = input.note?.trim() ?? "";
    if ((input.to === "NEEDS_MORE_INFO" || input.to === "REJECTED") && !note) {
      throw new Error("Trạng thái này yêu cầu ghi rõ lý do/phản hồi.");
    }
    const transition = transitionApplication(application.status, input.to);
    if (!transition.ok) throw transition.error;

    await db.$transaction(async (tx) => {
      await tx.application.update({
        where: { id: application.id },
        data: { status: transition.value, reviewNote: note || null },
      });
      await tx.notification.create({
        data: {
          tenantId: actor.tenantId,
          userId: application.studentId,
          type: `APPLICATION_${transition.value}`,
          title: "Trạng thái đơn đã thay đổi",
          body: note || `Đơn của bạn chuyển sang ${transition.value}.`,
          entityType: "Application",
          entityId: application.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "APPLICATION_REVIEW",
          entityType: "Application",
          entityId: application.id,
          requestId: randomUUID(),
          beforeJson: { status: application.status },
          afterJson: { status: transition.value, note: note || null },
        },
      });
    });
    revalidatePath("/applications");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể review đơn.",
    };
  }
}

export async function requestApplicationTransferAction(input: {
  applicationId: string;
  targetTeacherId: string;
  reason: string;
}) {
  const actor = await requirePermission("application.review");
  const reason = input.reason.trim();
  if (!reason) return { ok: false as const, error: "Hãy ghi lý do chuyển đơn." };
  try {
    const application = await db.application.findFirstOrThrow({
      where: { id: input.applicationId, tenantId: actor.tenantId },
    });
    if (!actor.roles.includes("SCHOOL_ADMIN") && application.currentTeacherId !== actor.userId) {
      throw new Error("Bạn không phải giáo viên đang phụ trách đơn này.");
    }
    if (application.currentTeacherId === input.targetTeacherId)
      throw new Error("Không thể chuyển cho chính giáo viên hiện tại.");
    await ensureEligibleTeacher(actor.tenantId, input.targetTeacherId);
    await db.$transaction(async (tx) => {
      await tx.application.update({
        where: { id: application.id },
        data: { pendingTransferTo: input.targetTeacherId, transferReason: reason },
      });
      await tx.notification.create({
        data: {
          tenantId: actor.tenantId,
          userId: input.targetTeacherId,
          type: "APPLICATION_TRANSFER_REQUESTED",
          title: "Có yêu cầu nhận chuyển đơn",
          body: reason,
          entityType: "Application",
          entityId: application.id,
        },
      });
    });
    revalidatePath("/applications");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể yêu cầu chuyển đơn.",
    };
  }
}

export async function respondApplicationTransferAction(applicationId: string, accept: boolean) {
  const actor = await requirePermission("application.review");
  try {
    const application = await db.application.findFirstOrThrow({
      where: { id: applicationId, tenantId: actor.tenantId },
    });
    if (application.pendingTransferTo !== actor.userId)
      throw new Error("Yêu cầu chuyển đơn không dành cho bạn.");

    await db.$transaction(async (tx) => {
      if (accept) {
        const transfer = acceptTransfer(
          {
            currentTeacherId: application.currentTeacherId,
            pendingTransferTo: application.pendingTransferTo,
          },
          actor.userId,
        );
        if (!transfer.ok) throw transfer.error;
        await tx.application.update({
          where: { id: application.id },
          data: {
            currentTeacherId: transfer.value.currentTeacherId,
            pendingTransferTo: null,
            transferReason: null,
          },
        });
      } else {
        await tx.application.update({
          where: { id: application.id },
          data: { pendingTransferTo: null, transferReason: null },
        });
      }
      await tx.notification.create({
        data: {
          tenantId: actor.tenantId,
          userId: application.currentTeacherId,
          type: accept ? "APPLICATION_TRANSFER_ACCEPTED" : "APPLICATION_TRANSFER_DECLINED",
          title: accept ? "Chuyển đơn đã được chấp nhận" : "Chuyển đơn bị từ chối",
          body: accept
            ? "Giáo viên mới đã trở thành người phụ trách."
            : "Bạn vẫn là giáo viên phụ trách đơn.",
          entityType: "Application",
          entityId: application.id,
        },
      });
    });
    revalidatePath("/applications");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể xử lý chuyển đơn.",
    };
  }
}
