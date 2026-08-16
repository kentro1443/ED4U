"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/authz";

/**
 * Room configuration.
 *
 * Rooms and their features are the input the Facility Engine plans over, so
 * this is configuration with operational consequences rather than a reference
 * list: taking a room out of service must immediately stop the engine from
 * recommending it, and must not silently vacate bookings already confirmed in
 * it — those are a human decision.
 */

export async function createRoomAction(formData: FormData) {
  const actor = await requirePermission("rooms.manage");
  try {
    const code = String(formData.get("code") ?? "")
      .trim()
      .toUpperCase();
    const name = String(formData.get("name") ?? "").trim();
    const roomTypeId = String(formData.get("roomTypeId") ?? "").trim();
    const building = String(formData.get("building") ?? "").trim();
    const floor = String(formData.get("floor") ?? "").trim();
    const capacity = Number.parseInt(String(formData.get("capacity") ?? ""), 10);

    if (!/^[A-Z0-9-]{2,12}$/.test(code)) {
      throw new Error("Mã phòng gồm 2–12 ký tự chữ, số hoặc dấu gạch ngang.");
    }
    if (name.length < 2 || name.length > 80) throw new Error("Tên phòng phải có 2–80 ký tự.");
    if (!building) throw new Error("Hãy nhập tòa nhà.");
    if (!floor) throw new Error("Hãy nhập tầng.");
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 2000) {
      throw new Error("Sức chứa phải nằm trong khoảng 1–2000.");
    }

    const roomType = await db.roomType.findFirst({
      where: { id: roomTypeId, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (!roomType) throw new Error("Loại phòng không thuộc trường hiện tại.");

    const duplicate = await db.room.findFirst({
      where: { tenantId: actor.tenantId, code },
      select: { id: true },
    });
    if (duplicate) throw new Error(`Mã phòng ${code} đã tồn tại.`);

    await db.$transaction(async (tx) => {
      const room = await tx.room.create({
        data: {
          tenantId: actor.tenantId,
          code,
          name,
          roomTypeId,
          building,
          floor,
          capacity,
          status: "ACTIVE",
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "ROOM_CREATE",
          entityType: "Room",
          entityId: room.id,
          requestId: randomUUID(),
          afterJson: { code, name, building, floor, capacity, status: "ACTIVE" },
        },
      });
    });

    revalidatePath("/admin/rooms");
    revalidatePath("/rooms");
    return { ok: true as const, code };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể tạo phòng.",
    };
  }
}

export async function setRoomStatusAction(roomId: string, status: string) {
  const actor = await requirePermission("rooms.manage");
  try {
    if (!["ACTIVE", "MAINTENANCE", "DISABLED"].includes(status)) {
      throw new Error("Trạng thái phòng không hợp lệ.");
    }
    const room = await db.room.findFirst({
      where: { id: roomId, tenantId: actor.tenantId },
      select: { id: true, code: true, status: true },
    });
    if (!room) throw new Error("Không tìm thấy phòng trong trường này.");

    // Confirmed bookings are never displaced automatically — the administrator
    // is told what is affected and decides. Silently voiding a booking would
    // strand an event that people are already travelling to.
    const affected = await db.roomBooking.count({
      where: {
        roomId: room.id,
        cancelledAt: null,
        startAt: { gte: new Date() },
      },
    });

    await db.$transaction(async (tx) => {
      await tx.room.update({
        where: { id: room.id },
        data: { status: status as "ACTIVE" | "MAINTENANCE" | "DISABLED" },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "ROOM_STATUS_CHANGE",
          entityType: "Room",
          entityId: room.id,
          requestId: randomUUID(),
          beforeJson: { status: room.status },
          afterJson: { status, code: room.code, futureBookingsAtChange: affected },
        },
      });
    });

    revalidatePath("/admin/rooms");
    revalidatePath("/rooms");
    revalidatePath("/rooms/schedule");
    return { ok: true as const, affected };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể đổi trạng thái phòng.",
    };
  }
}
