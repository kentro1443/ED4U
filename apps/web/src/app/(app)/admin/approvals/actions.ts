"use server";

import { requirePermission } from "@/lib/authz";
import { db } from "@/lib/db";
import { approveRoomRequestTx, rejectRoomRequestTx } from "@/features/services/roomBooking";

export async function approveRoomRequestAction(requestId: string) {
  const actor = await requirePermission("room.approve");
  try {
    const result = await approveRoomRequestTx(db, {
      requestId,
      actorId: actor.userId,
      tenantId: actor.tenantId,
    });
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể duyệt yêu cầu phòng.",
    };
  }
}

export async function rejectRoomRequestAction(requestId: string, reason: string) {
  const actor = await requirePermission("room.approve");
  try {
    const result = await rejectRoomRequestTx(db, {
      requestId,
      actorId: actor.userId,
      tenantId: actor.tenantId,
      reason,
    });
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể từ chối yêu cầu phòng.",
    };
  }
}
