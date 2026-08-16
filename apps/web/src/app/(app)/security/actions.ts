"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { currentSessionId } from "@/lib/auth";

/**
 * Session control for the signed-in user.
 *
 * Revocation is scoped to the caller's own sessions and never touches the
 * session backing the current request: signing yourself out while reviewing
 * your sessions would look like the product broke, and it would also make the
 * "I think someone else is logged in" workflow impossible to finish.
 */

export async function revokeSessionAction(sessionId: string) {
  const actor = await requireActor();
  try {
    const current = await currentSessionId();
    if (sessionId === current) {
      throw new Error("Đây là phiên bạn đang dùng. Hãy dùng nút Đăng xuất để kết thúc phiên này.");
    }

    const session = await db.session.findFirst({
      where: { id: sessionId, userId: actor.userId, revokedAt: null },
      select: { id: true },
    });
    if (!session) throw new Error("Không tìm thấy phiên đăng nhập đang hoạt động.");

    await db.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "SESSION_REVOKE",
          entityType: "Session",
          entityId: session.id,
          requestId: randomUUID(),
          afterJson: { revokedBy: "self", scope: "single" },
        },
      });
    });

    revalidatePath("/security");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể thu hồi phiên đăng nhập.",
    };
  }
}

export async function revokeOtherSessionsAction() {
  const actor = await requireActor();
  try {
    const current = await currentSessionId();

    const result = await db.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: {
          userId: actor.userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          ...(current ? { id: { not: current } } : {}),
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count > 0) {
        await tx.auditEvent.create({
          data: {
            tenantId: actor.tenantId,
            actorId: actor.userId,
            action: "SESSION_REVOKE",
            entityType: "Session",
            entityId: actor.userId,
            requestId: randomUUID(),
            afterJson: { revokedBy: "self", scope: "all-others", count: revoked.count },
          },
        });
      }
      return revoked.count;
    });

    revalidatePath("/security");
    return { ok: true as const, revoked: result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể thu hồi các phiên khác.",
    };
  }
}
