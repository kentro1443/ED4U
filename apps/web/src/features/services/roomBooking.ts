import { approveRoomRequest, type OccupiedSlot } from "@ed4u/domain";
import type { PrismaClient } from "@/generated/prisma/client";

export async function approveRoomRequestTx(
  db: PrismaClient,
  input: { requestId: string; actorId: string; tenantId: string },
) {
  return db.$transaction(async (tx) => {
    const req = await tx.roomRequest.findFirst({
      where: { id: input.requestId, tenantId: input.tenantId },
    });
    if (!req) throw new Error("NOT_FOUND");
    const [bookings, blocks, entries] = await Promise.all([
      tx.roomBooking.findMany({
        where: { roomId: req.roomId, cancelledAt: null, tenantId: input.tenantId },
      }),
      tx.roomBlock.findMany({ where: { roomId: req.roomId, tenantId: input.tenantId } }),
      tx.timetableEntry.findMany({ where: { roomId: req.roomId, tenantId: input.tenantId } }),
    ]);
    const occupancy: OccupiedSlot[] = [
      ...bookings.map((b) => ({
        roomId: b.roomId,
        startAt: b.startAt,
        endAt: b.endAt,
        source: "CONFIRMED_BOOKING" as const,
        label: b.id,
      })),
      ...blocks.map((b) => ({
        roomId: b.roomId,
        startAt: b.startAt,
        endAt: b.endAt,
        source: "MAINTENANCE_BLOCK" as const,
        label: b.reason,
      })),
      ...entries.map((e) => ({
        roomId: e.roomId,
        startAt: req.eventStart,
        endAt: req.eventEnd,
        source: "TIMETABLE" as const,
        label: e.id,
      })),
    ];
    const hours = await tx.operationalHours.findUnique({ where: { tenantId: input.tenantId } });
    const decision = approveRoomRequest({
      requestId: req.id,
      roomId: req.roomId,
      eventStart: req.eventStart,
      eventEnd: req.eventEnd,
      setupMinutes: req.setupMinutes,
      cleanupMinutes: req.cleanupMinutes,
      occupancy,
      operationalHours: {
        startMinutes: hours?.startMinutes ?? 420,
        endMinutes: hours?.endMinutes ?? 1200,
      },
      now: new Date(),
    });
    if (!decision.ok) {
      throw decision.error;
    }
    await tx.roomBooking.create({
      data: {
        tenantId: input.tenantId,
        roomId: req.roomId,
        requestId: req.id,
        startAt: decision.value.startAt,
        endAt: decision.value.endAt,
      },
    });
    await tx.roomRequest.update({ where: { id: req.id }, data: { status: "APPROVED" } });
    await tx.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: "ROOM_APPROVE",
        entityType: "RoomRequest",
        entityId: req.id,
        requestId: input.requestId,
      },
    });
    return decision.value;
  });
}
