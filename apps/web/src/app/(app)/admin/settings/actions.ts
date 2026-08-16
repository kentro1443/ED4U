"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/authz";

/**
 * System settings.
 *
 * Operating hours are read by the Facility Engine when it decides whether a
 * requested slot is even permissible, so this form writes the value the engine
 * actually consumes. Displaying a hardcoded "07:00–20:00" while the engine read
 * something else was worse than showing nothing: it told an administrator the
 * system was configured when it was not.
 */

function parseMinutes(value: string, label: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`${label} phải có dạng HH:MM.`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`${label} không phải là giờ hợp lệ.`);
  return hours * 60 + minutes;
}

export async function updateOperationalHoursAction(formData: FormData) {
  const actor = await requirePermission("system.settings");
  try {
    const startMinutes = parseMinutes(String(formData.get("startTime") ?? ""), "Giờ mở cửa");
    const endMinutes = parseMinutes(String(formData.get("endTime") ?? ""), "Giờ đóng cửa");

    if (endMinutes <= startMinutes) {
      throw new Error("Giờ đóng cửa phải sau giờ mở cửa.");
    }
    if (endMinutes - startMinutes < 60) {
      throw new Error("Khung giờ hoạt động phải kéo dài ít nhất 60 phút.");
    }

    const existing = await db.operationalHours.findUnique({
      where: { tenantId: actor.tenantId },
    });

    await db.$transaction(async (tx) => {
      await tx.operationalHours.upsert({
        where: { tenantId: actor.tenantId },
        create: { tenantId: actor.tenantId, startMinutes, endMinutes },
        update: { startMinutes, endMinutes },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "SETTINGS_OPERATIONAL_HOURS_UPDATE",
          entityType: "OperationalHours",
          entityId: actor.tenantId,
          requestId: randomUUID(),
          beforeJson: existing
            ? { startMinutes: existing.startMinutes, endMinutes: existing.endMinutes }
            : undefined,
          afterJson: { startMinutes, endMinutes },
        },
      });
    });

    revalidatePath("/admin/settings");
    revalidatePath("/rooms");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể lưu cài đặt.",
    };
  }
}
