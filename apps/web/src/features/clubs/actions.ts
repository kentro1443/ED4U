"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  approveFinanceEntry,
  can,
  canApproveFinance,
  canApproveMembership,
  canCreateFinanceEntry,
  canProposeEvent,
  civilDateTimeToInstant,
  isCorePlus,
  voidFinanceEntry,
  type ClubRole,
} from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor, requirePermission } from "@/lib/authz";

async function activeClubMembership(clubId: string, userId: string) {
  return db.clubMembership.findFirst({
    where: { clubId, userId, status: "ACTIVE" },
  });
}

async function clubInTenant(clubId: string, tenantId: string) {
  const club = await db.club.findFirst({ where: { id: clubId, tenantId } });
  if (!club) throw new Error("Không tìm thấy câu lạc bộ trong trường này.");
  return club;
}

async function audit(input: {
  tenantId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: object | null;
  afterJson?: object | null;
}) {
  await db.auditEvent.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: randomUUID(),
      beforeJson: input.beforeJson ?? undefined,
      afterJson: input.afterJson ?? undefined,
    },
  });
}

export async function proposeClubAction(input: { name: string; description: string }) {
  const actor = await requirePermission("club.propose");
  if (actor.memberType !== "STUDENT" || actor.membershipStatus !== "ACTIVE") {
    return { ok: false as const, error: "Chỉ học sinh đang theo học mới được đề xuất câu lạc bộ." };
  }
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < 3 || name.length > 100)
    return { ok: false as const, error: "Tên CLB phải có 3–100 ký tự." };
  if (description.length < 20 || description.length > 1500)
    return { ok: false as const, error: "Hãy mô tả mục tiêu CLB rõ hơn (20–1500 ký tự)." };

  const duplicate = await db.club.findFirst({
    where: {
      tenantId: actor.tenantId,
      name: { equals: name, mode: "insensitive" },
      status: { not: "REJECTED" },
    },
  });
  if (duplicate) return { ok: false as const, error: "Đã tồn tại CLB hoặc đề xuất cùng tên." };

  const club = await db.$transaction(async (tx) => {
    const created = await tx.club.create({
      data: {
        tenantId: actor.tenantId,
        name,
        description,
        proposedBy: actor.userId,
        status: "PROPOSED",
        members: {
          create: { userId: actor.userId, role: "PRESIDENT", status: "PENDING" },
        },
      },
    });
    const admins = await tx.userRoleAssignment.findMany({
      where: { role: "SCHOOL_ADMIN", user: { tenantId: actor.tenantId } },
      select: { userId: true },
    });
    if (admins.length) {
      await tx.notification.createMany({
        data: admins.map((admin) => ({
          tenantId: actor.tenantId,
          userId: admin.userId,
          type: "CLUB_PROPOSED",
          title: "Có đề xuất CLB mới",
          body: name,
          entityType: "Club",
          entityId: created.id,
        })),
      });
    }
    return created;
  });
  await audit({
    tenantId: actor.tenantId,
    actorId: actor.userId,
    action: "CLUB_PROPOSE",
    entityType: "Club",
    entityId: club.id,
    afterJson: { name },
  });
  revalidatePath("/clubs");
  return { ok: true as const, clubId: club.id };
}

export async function resolveClubProposalAction(input: {
  clubId: string;
  approve: boolean;
  reason?: string;
}) {
  const actor = await requirePermission("club.manage");
  try {
    const club = await clubInTenant(input.clubId, actor.tenantId);
    if (club.status !== "PROPOSED") throw new Error("CLB không còn ở trạng thái chờ duyệt.");
    const reason = input.reason?.trim() ?? "";
    if (!input.approve && !reason) throw new Error("Từ chối đề xuất phải có lý do.");
    await db.$transaction(async (tx) => {
      await tx.club.update({
        where: { id: club.id },
        data: {
          status: input.approve ? "ACTIVE" : "REJECTED",
          decisionReason: reason || null,
          approvedBy: input.approve ? actor.userId : null,
          approvedAt: input.approve ? new Date() : null,
        },
      });
      if (club.proposedBy) {
        if (input.approve) {
          await tx.clubMembership.updateMany({
            where: { clubId: club.id, userId: club.proposedBy, role: "PRESIDENT" },
            data: { status: "ACTIVE" },
          });
        } else {
          await tx.clubMembership.updateMany({
            where: { clubId: club.id, status: "PENDING" },
            data: { status: "REJECTED" },
          });
        }
        await tx.notification.create({
          data: {
            tenantId: actor.tenantId,
            userId: club.proposedBy,
            type: input.approve ? "CLUB_APPROVED" : "CLUB_REJECTED",
            title: input.approve ? "Đề xuất CLB đã được duyệt" : "Đề xuất CLB bị từ chối",
            body: reason || club.name,
            entityType: "Club",
            entityId: club.id,
          },
        });
      }
    });
    await audit({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      action: input.approve ? "CLUB_APPROVE" : "CLUB_REJECT",
      entityType: "Club",
      entityId: club.id,
      beforeJson: { status: club.status },
      afterJson: { status: input.approve ? "ACTIVE" : "REJECTED", reason: reason || null },
    });
    revalidatePath("/clubs");
    revalidatePath(`/clubs/${club.id}`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể xử lý đề xuất CLB.",
    };
  }
}

export async function joinClubAction(clubId: string) {
  const actor = await requireActor();
  if (actor.memberType !== "STUDENT" || actor.membershipStatus !== "ACTIVE")
    return { ok: false as const, error: "Chỉ học sinh đang theo học mới được tham gia CLB." };
  try {
    const club = await clubInTenant(clubId, actor.tenantId);
    if (club.status !== "ACTIVE") throw new Error("CLB chưa hoạt động.");
    const existing = await db.clubMembership.findUnique({
      where: { clubId_userId: { clubId, userId: actor.userId } },
    });
    if (existing?.status === "ACTIVE" || existing?.status === "PENDING")
      throw new Error("Bạn đã là thành viên hoặc đang chờ duyệt.");
    await db.clubMembership.upsert({
      where: { clubId_userId: { clubId, userId: actor.userId } },
      update: { status: "PENDING", role: "MEMBER" },
      create: { clubId, userId: actor.userId, role: "MEMBER", status: "PENDING" },
    });
    revalidatePath(`/clubs/${clubId}`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể gửi yêu cầu tham gia.",
    };
  }
}

export async function resolveClubMembershipAction(input: {
  membershipId: string;
  approve: boolean;
}) {
  const actor = await requireActor();
  try {
    const membership = await db.clubMembership.findUnique({
      where: { id: input.membershipId },
      include: { club: true },
    });
    if (!membership || membership.club.tenantId !== actor.tenantId)
      throw new Error("Không tìm thấy yêu cầu thành viên.");
    const actorMembership = await activeClubMembership(membership.clubId, actor.userId);
    const allowed =
      actor.roles.includes("SCHOOL_ADMIN") ||
      (actorMembership && canApproveMembership(actorMembership.role as ClubRole, false));
    if (!allowed) throw new Error("Bạn không có quyền duyệt thành viên.");
    if (membership.status !== "PENDING") throw new Error("Yêu cầu không còn ở trạng thái chờ.");
    await db.clubMembership.update({
      where: { id: membership.id },
      data: { status: input.approve ? "ACTIVE" : "REJECTED" },
    });
    await db.notification.create({
      data: {
        tenantId: actor.tenantId,
        userId: membership.userId,
        type: input.approve ? "CLUB_JOIN_APPROVED" : "CLUB_JOIN_REJECTED",
        title: input.approve ? "Bạn đã được duyệt vào CLB" : "Yêu cầu tham gia CLB bị từ chối",
        body: membership.club.name,
        entityType: "Club",
        entityId: membership.clubId,
      },
    });
    revalidatePath(`/clubs/${membership.clubId}`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể xử lý thành viên.",
    };
  }
}

export async function transferClubPresidencyAction(input: {
  clubId: string;
  targetMembershipId: string;
}) {
  const actor = await requireActor();
  try {
    const club = await clubInTenant(input.clubId, actor.tenantId);
    const actorMembership = await activeClubMembership(club.id, actor.userId);
    if (!actor.roles.includes("SCHOOL_ADMIN") && actorMembership?.role !== "PRESIDENT")
      throw new Error("Chỉ President hoặc School Admin được chuyển quyền.");
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`club-president:${club.id}`}))::text AS locked`;
      const target = await tx.clubMembership.findFirst({
        where: { id: input.targetMembershipId, clubId: club.id, status: "ACTIVE" },
      });
      if (!target) throw new Error("Thành viên nhận quyền không hợp lệ.");
      if (target.role === "PRESIDENT") return;
      await tx.clubMembership.updateMany({
        where: { clubId: club.id, status: "ACTIVE", role: "PRESIDENT" },
        data: { role: "VICE_PRESIDENT" },
      });
      await tx.clubMembership.update({ where: { id: target.id }, data: { role: "PRESIDENT" } });
    });
    revalidatePath(`/clubs/${club.id}`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể chuyển quyền President.",
    };
  }
}

export async function addClubAdvisorAction(input: { clubId: string; teacherId: string }) {
  const actor = await requireActor();
  try {
    const club = await clubInTenant(input.clubId, actor.tenantId);
    const existingAdvisor = await db.clubAdvisor.findFirst({
      where: { clubId: club.id, teacherId: actor.userId },
    });
    if (!actor.roles.includes("SCHOOL_ADMIN") && !existingAdvisor)
      throw new Error("Chỉ School Admin hoặc advisor hiện tại được thêm advisor.");
    const teacher = await db.teacherProfile.findFirst({
      where: {
        tenantId: actor.tenantId,
        userId: input.teacherId,
        user: {
          roles: { some: { role: "TEACHER" } },
          memberships: {
            some: { tenantId: actor.tenantId, memberType: "TEACHER", membershipStatus: "ACTIVE" },
          },
        },
      },
    });
    if (!teacher) throw new Error("Giáo viên không còn đủ điều kiện làm advisor.");
    const count = await db.clubAdvisor.count({ where: { clubId: club.id } });
    await db.clubAdvisor.upsert({
      where: { clubId_teacherId: { clubId: club.id, teacherId: input.teacherId } },
      update: {},
      create: {
        clubId: club.id,
        teacherId: input.teacherId,
        isPrimary: count === 0,
        addedBy: actor.userId,
      },
    });
    revalidatePath(`/clubs/${club.id}`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể thêm advisor.",
    };
  }
}

export async function createFinanceEntryAction(input: {
  clubId: string;
  kind: "INCOME" | "EXPENSE";
  amount: number;
  category: string;
  description: string;
}) {
  const actor = await requireActor();
  try {
    const club = await clubInTenant(input.clubId, actor.tenantId);
    const membership = await activeClubMembership(club.id, actor.userId);
    const allowed =
      actor.roles.includes("SCHOOL_ADMIN") ||
      (membership && canCreateFinanceEntry(membership.role as ClubRole, false));
    if (!allowed) throw new Error("Bạn không có quyền ghi sổ CLB.");
    if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000)
      throw new Error("Số tiền không hợp lệ.");
    const entry = await db.financeEntry.create({
      data: {
        clubId: club.id,
        kind: input.kind,
        amount: input.amount,
        category: input.category.trim() || "Khác",
        description: input.description.trim(),
        status: "PENDING",
        createdBy: actor.userId,
      },
    });
    revalidatePath(`/clubs/${club.id}`);
    return { ok: true as const, entryId: entry.id };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể tạo bút toán.",
    };
  }
}

export async function approveFinanceEntryAction(entryId: string) {
  const actor = await requireActor();
  try {
    const entry = await db.financeEntry.findUnique({
      where: { id: entryId },
      include: { club: true },
    });
    if (!entry || entry.club.tenantId !== actor.tenantId)
      throw new Error("Không tìm thấy bút toán.");
    const membership = await activeClubMembership(entry.clubId, actor.userId);
    const allowed =
      actor.roles.includes("SCHOOL_ADMIN") ||
      (membership && canApproveFinance(membership.role as ClubRole, false));
    if (!allowed) throw new Error("Bạn không có quyền duyệt tài chính.");
    const decision = approveFinanceEntry({
      id: entry.id,
      amount: entry.amount,
      currency: entry.currency,
      status: entry.status,
      amountImmutable: false,
    });
    if (!decision.ok) throw decision.error;
    await db.financeEntry.update({
      where: { id: entry.id },
      data: { status: "APPROVED", approvedBy: actor.userId },
    });
    revalidatePath(`/clubs/${entry.clubId}`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể duyệt bút toán.",
    };
  }
}

export async function voidFinanceEntryAction(entryId: string, reason: string) {
  const actor = await requireActor();
  try {
    const entry = await db.financeEntry.findUnique({
      where: { id: entryId },
      include: { club: true },
    });
    if (!entry || entry.club.tenantId !== actor.tenantId)
      throw new Error("Không tìm thấy bút toán.");
    const membership = await activeClubMembership(entry.clubId, actor.userId);
    const allowed = actor.roles.includes("SCHOOL_ADMIN") || membership?.role === "PRESIDENT";
    if (!allowed) throw new Error("Chỉ President hoặc School Admin được VOID bút toán.");
    const decision = voidFinanceEntry(
      {
        id: entry.id,
        amount: entry.amount,
        currency: entry.currency,
        status: entry.status,
        amountImmutable: true,
      },
      reason,
    );
    if (!decision.ok) throw decision.error;
    await db.financeEntry.update({
      where: { id: entry.id },
      data: { status: "VOIDED", voidedBy: actor.userId, voidReason: reason.trim() },
    });
    revalidatePath(`/clubs/${entry.clubId}`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể VOID bút toán.",
    };
  }
}

export async function createClubEventAction(input: {
  clubId: string;
  title: string;
  startAt: string;
  endAt: string;
  visibility: "SCHOOL" | "GRADE" | "CLASS" | "CLUB" | "PRIVATE";
  roomRequired: boolean;
}) {
  const actor = await requireActor();
  try {
    const club = await clubInTenant(input.clubId, actor.tenantId);
    const membership = await activeClubMembership(club.id, actor.userId);
    const allowed =
      actor.roles.includes("SCHOOL_ADMIN") ||
      (membership && canProposeEvent(membership.role as ClubRole, false));
    if (!allowed) throw new Error("Bạn không có quyền đề xuất sự kiện CLB.");
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: actor.tenantId },
      select: { timezone: true },
    });
    const parseLocal = (value: string) => {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
      if (!match) throw new Error("Ngày giờ sự kiện không hợp lệ.");
      return civilDateTimeToInstant(
        {
          year: Number(match[1]),
          month: Number(match[2]),
          day: Number(match[3]),
          hour: Number(match[4]),
          minute: Number(match[5]),
        },
        tenant.timezone,
      );
    };
    const startAt = parseLocal(input.startAt);
    const endAt = parseLocal(input.endAt);
    if (endAt <= startAt || startAt <= new Date())
      throw new Error(
        "Khung giờ sự kiện phải nằm trong tương lai và có giờ kết thúc sau giờ bắt đầu.",
      );
    const event = await db.clubEvent.create({
      data: {
        clubId: club.id,
        title: input.title.trim(),
        startAt,
        endAt,
        visibility: input.visibility,
        roomRequired: input.roomRequired,
        roomResolved: !input.roomRequired,
        status: "PENDING",
      },
    });
    revalidatePath(`/clubs/${club.id}`);
    return { ok: true as const, eventId: event.id };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể tạo đề xuất sự kiện.",
    };
  }
}

export async function resolveClubEventAction(input: {
  eventId: string;
  approve: boolean;
  reason?: string;
}) {
  const actor = await requirePermission("club.manage");
  try {
    const event = await db.clubEvent.findUnique({
      where: { id: input.eventId },
      include: { club: true, roomRequest: { include: { booking: true } } },
    });
    if (!event || event.club.tenantId !== actor.tenantId)
      throw new Error("Không tìm thấy sự kiện.");
    const reason = input.reason?.trim() ?? "";
    if (!input.approve && !reason) throw new Error("Từ chối sự kiện phải có lý do.");
    let status = input.approve ? "APPROVED" : "REJECTED";
    if (
      input.approve &&
      event.roomRequired &&
      (!event.roomResolved || !event.roomRequest?.booking || event.roomRequest.booking.cancelledAt)
    )
      status = "NEEDS_RESOURCE";
    await db.clubEvent.update({ where: { id: event.id }, data: { status } });
    revalidatePath(`/clubs/${event.clubId}`);
    revalidatePath("/calendar");
    return { ok: true as const, status };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể xử lý sự kiện.",
    };
  }
}

import { DOC_VISIBILITY, type DocVisibility } from "@ed4u/domain";
import { deletePrivateFile, savePrivatePdf } from "@/lib/files/privateStorage";

function isDocVisibility(value: string): value is DocVisibility {
  return (DOC_VISIBILITY as readonly string[]).includes(value);
}

export async function createClubDocumentAction(clubId: string, formData: FormData) {
  const actor = await requireActor();
  const title = String(formData.get("title") ?? "").trim();
  const visibilityRaw = String(formData.get("visibility") ?? "ALL_MEMBERS");
  const file = formData.get("file");
  if (!title) return { ok: false as const, error: "Hãy nhập tên tài liệu." };
  if (!isDocVisibility(visibilityRaw))
    return { ok: false as const, error: "Mức hiển thị tài liệu không hợp lệ." };
  if (!(file instanceof File)) return { ok: false as const, error: "Hãy chọn PDF." };
  try {
    const club = await clubInTenant(clubId, actor.tenantId);
    const membership = await activeClubMembership(club.id, actor.userId);
    const allowed =
      actor.roles.includes("SCHOOL_ADMIN") ||
      (membership && isCorePlus(membership.role as ClubRole));
    if (!allowed) throw new Error("Chỉ Core+ hoặc School Admin được tải tài liệu CLB.");
    const stored = await savePrivatePdf(db, {
      tenantId: actor.tenantId,
      userId: actor.userId,
      file,
    });
    try {
      await db.clubDocument.create({
        data: {
          clubId: club.id,
          title,
          visibility: visibilityRaw,
          versions: { create: { version: 1, fileId: stored.id } },
        },
      });
      revalidatePath(`/clubs/${club.id}`);
      return { ok: true as const };
    } catch (error) {
      await db.storedFile.delete({ where: { id: stored.id } }).catch(() => undefined);
      await deletePrivateFile(stored.storageKey).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể tạo tài liệu.",
    };
  }
}

export async function addClubDocumentVersionAction(documentId: string, formData: FormData) {
  const actor = await requireActor();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "Hãy chọn PDF." };
  try {
    const document = await db.clubDocument.findUnique({
      where: { id: documentId },
      include: { club: true, versions: true },
    });
    if (!document || document.club.tenantId !== actor.tenantId)
      throw new Error("Không tìm thấy tài liệu.");
    const membership = await activeClubMembership(document.clubId, actor.userId);
    const allowed =
      actor.roles.includes("SCHOOL_ADMIN") ||
      (membership && isCorePlus(membership.role as ClubRole));
    if (!allowed) throw new Error("Bạn không có quyền thêm phiên bản tài liệu.");
    const stored = await savePrivatePdf(db, {
      tenantId: actor.tenantId,
      userId: actor.userId,
      file,
    });
    try {
      const nextVersion = Math.max(0, ...document.versions.map((version) => version.version)) + 1;
      await db.clubDocumentVersion.create({
        data: { documentId, version: nextVersion, fileId: stored.id },
      });
      revalidatePath(`/clubs/${document.clubId}`);
      return { ok: true as const, version: nextVersion };
    } catch (error) {
      await db.storedFile.delete({ where: { id: stored.id } }).catch(() => undefined);
      await deletePrivateFile(stored.storageKey).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể thêm phiên bản.",
    };
  }
}
