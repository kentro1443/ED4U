"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { civilDateTimeToInstant } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/authz";

function localDateTime(value: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Ngày giờ không hợp lệ.");
  return civilDateTimeToInstant(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
    },
    timeZone,
  );
}

export async function createSchoolEventAction(formData: FormData) {
  const actor = await requirePermission("events.manage");
  try {
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: actor.tenantId },
      select: { timezone: true },
    });
    const title = String(formData.get("title") ?? "").trim();
    const visibility = String(formData.get("visibility") ?? "SCHOOL");
    const grade = String(formData.get("grade") ?? "").trim();
    const classId = String(formData.get("classId") ?? "").trim();
    if (title.length < 3 || title.length > 180) throw new Error("Tên sự kiện phải có 3–180 ký tự.");
    if (!["SCHOOL", "GRADE", "CLASS"].includes(visibility))
      throw new Error("Visibility không hợp lệ.");
    if (visibility === "GRADE" && !grade) throw new Error("Hãy chọn khối lớp.");
    if (visibility === "CLASS" && !classId) throw new Error("Hãy chọn lớp.");
    if (classId) {
      const klass = await db.class.findFirst({ where: { id: classId, tenantId: actor.tenantId } });
      if (!klass) throw new Error("Lớp không thuộc trường hiện tại.");
    }
    const startAt = localDateTime(String(formData.get("startAt") ?? ""), tenant.timezone);
    const endAt = localDateTime(String(formData.get("endAt") ?? ""), tenant.timezone);
    if (endAt <= startAt) throw new Error("Giờ kết thúc phải sau giờ bắt đầu.");

    const event = await db.$transaction(async (tx) => {
      const created = await tx.schoolEvent.create({
        data: {
          tenantId: actor.tenantId,
          title,
          startAt,
          endAt,
          visibility: visibility as "SCHOOL" | "GRADE" | "CLASS",
          grade: visibility === "GRADE" ? grade : null,
          classId: visibility === "CLASS" ? classId : null,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "SCHOOL_EVENT_CREATE",
          entityType: "SchoolEvent",
          entityId: created.id,
          requestId: randomUUID(),
          afterJson: {
            title,
            visibility,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
          },
        },
      });
      return created;
    });
    revalidatePath("/events");
    revalidatePath("/calendar");
    return { ok: true as const, eventId: event.id };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể tạo sự kiện.",
    };
  }
}

export async function deleteSchoolEventAction(eventId: string) {
  const actor = await requirePermission("events.manage");
  try {
    const event = await db.schoolEvent.findFirst({
      where: { id: eventId, tenantId: actor.tenantId },
    });
    if (!event) throw new Error("Không tìm thấy sự kiện.");
    await db.$transaction(async (tx) => {
      await tx.schoolEvent.delete({ where: { id: event.id } });
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "SCHOOL_EVENT_DELETE",
          entityType: "SchoolEvent",
          entityId: event.id,
          requestId: randomUUID(),
          beforeJson: {
            title: event.title,
            startAt: event.startAt.toISOString(),
            endAt: event.endAt.toISOString(),
          },
        },
      });
    });
    revalidatePath("/events");
    revalidatePath("/calendar");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể xóa sự kiện.",
    };
  }
}
