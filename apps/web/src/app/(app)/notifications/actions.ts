"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";

/**
 * Notification read state.
 *
 * The `readAt` column already existed and nothing ever wrote it, so every
 * notification stayed new forever and the list could not tell a user what they
 * had already dealt with. Both actions are scoped to the caller's own rows.
 */

export async function markNotificationReadAction(notificationId: string) {
  const actor = await requireActor();
  try {
    const result = await db.notification.updateMany({
      where: {
        id: notificationId,
        userId: actor.userId,
        tenantId: actor.tenantId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      return { ok: false as const, error: "Không tìm thấy thông báo chưa đọc." };
    }
    revalidatePath("/notifications");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Không thể cập nhật thông báo." };
  }
}

export async function markAllNotificationsReadAction() {
  const actor = await requireActor();
  try {
    const result = await db.notification.updateMany({
      where: { userId: actor.userId, tenantId: actor.tenantId, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/notifications");
    return { ok: true as const, count: result.count };
  } catch {
    return { ok: false as const, error: "Không thể cập nhật thông báo." };
  }
}
