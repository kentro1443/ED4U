import { randomUUID } from "node:crypto";
import {
  approveRoomRequest,
  occupiedInterval,
  periodOccurrence,
  transitionRoomRequest,
  type OccupiedSlot,
} from "@ed4u/domain";
import type { PrismaClient } from "@/generated/prisma/client";

async function lockRequestAndRoom(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  input: { requestId: string; tenantId: string },
) {
  const requests = await tx.$queryRaw<Array<{ id: string; roomId: string }>>`
    SELECT "id"::text, "roomId"::text
    FROM "RoomRequest"
    WHERE "id" = ${input.requestId} AND "tenantId" = ${input.tenantId}
    FOR UPDATE
  `;
  const locked = requests[0];
  if (!locked) throw new Error("Không tìm thấy yêu cầu phòng.");

  const rooms = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text
    FROM "Room"
    WHERE "id" = ${locked.roomId} AND "tenantId" = ${input.tenantId}
    FOR UPDATE
  `;
  if (!rooms[0]) throw new Error("Phòng không tồn tại trong trường này.");
  return locked;
}

/**
 * SCHOOL_ADMIN approval path. Request + Room rows are locked, then every hard
 * constraint is rebuilt from live state before the booking is inserted.
 */
export async function approveRoomRequestTx(
  db: PrismaClient,
  input: { requestId: string; actorId: string; tenantId: string },
) {
  return db.$transaction(async (tx) => {
    await lockRequestAndRoom(tx, input);
    const req = await tx.roomRequest.findFirst({
      where: { id: input.requestId, tenantId: input.tenantId },
    });
    if (!req) throw new Error("Không tìm thấy yêu cầu phòng.");
    if (req.status !== "PENDING_APPROVAL") {
      throw new Error(`Yêu cầu không còn ở trạng thái chờ duyệt (${req.status}).`);
    }

    const target = occupiedInterval(
      req.eventStart,
      req.eventEnd,
      req.setupMinutes,
      req.cleanupMinutes,
    );
    // Interactive transactions use one PostgreSQL connection. Keep queries
    // sequential inside the transaction instead of Promise.all so pg never has
    // concurrent client.query calls on the same connection.
    const bookings = await tx.roomBooking.findMany({
      where: {
        roomId: req.roomId,
        cancelledAt: null,
        tenantId: input.tenantId,
        startAt: { lt: target.endAt },
        endAt: { gt: target.startAt },
      },
    });
    const blocks = await tx.roomBlock.findMany({
      where: {
        roomId: req.roomId,
        tenantId: input.tenantId,
        startAt: { lt: target.endAt },
        endAt: { gt: target.startAt },
      },
    });
    const entries = await tx.timetableEntry.findMany({
      where: { roomId: req.roomId, tenantId: input.tenantId },
      include: { period: true, class: true, subject: true },
    });
    const hours = await tx.operationalHours.findUnique({ where: { tenantId: input.tenantId } });
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: input.tenantId },
      select: { timezone: true },
    });

    const timetable: OccupiedSlot[] = entries.map((entry) => {
      const occurrence = periodOccurrence({
        anchor: req.eventStart,
        weekday: entry.weekday,
        startTime: entry.period.startTime,
        endTime: entry.period.endTime,
        timeZone: tenant.timezone,
      });
      return {
        roomId: entry.roomId,
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        source: "TIMETABLE" as const,
        label: `${entry.class.code} · ${entry.subject.name}`,
      };
    });
    const occupancy: OccupiedSlot[] = [
      ...bookings.map((booking) => ({
        roomId: booking.roomId,
        startAt: booking.startAt,
        endAt: booking.endAt,
        source: "CONFIRMED_BOOKING" as const,
        label: booking.id,
      })),
      ...blocks.map((block) => ({
        roomId: block.roomId,
        startAt: block.startAt,
        endAt: block.endAt,
        source: "MAINTENANCE_BLOCK" as const,
        label: block.reason,
      })),
      ...timetable,
    ];

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
      timeZone: tenant.timezone,
      now: new Date(),
    });
    if (!decision.ok) throw decision.error;

    const transition = transitionRoomRequest(req.status, "APPROVED");
    if (!transition.ok) throw transition.error;

    const booking = await tx.roomBooking.create({
      data: {
        tenantId: input.tenantId,
        roomId: req.roomId,
        requestId: req.id,
        startAt: decision.value.startAt,
        endAt: decision.value.endAt,
      },
    });
    await tx.roomRequest.update({
      where: { id: req.id },
      data: {
        status: transition.value,
        resolvedBy: input.actorId,
        resolvedAt: new Date(),
        decisionReason: null,
      },
    });
    await tx.notification.create({
      data: {
        tenantId: input.tenantId,
        userId: req.requestedBy,
        type: "ROOM_REQUEST_APPROVED",
        title: "Yêu cầu phòng đã được duyệt",
        body: "Phòng đã được khóa theo khung giờ yêu cầu.",
        entityType: "RoomRequest",
        entityId: req.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: "ROOM_APPROVE",
        entityType: "RoomRequest",
        entityId: req.id,
        requestId: randomUUID(),
        afterJson: { bookingId: booking.id, roomId: req.roomId },
      },
    });
    return { ...decision.value, bookingId: booking.id };
  });
}

export async function rejectRoomRequestTx(
  db: PrismaClient,
  input: { requestId: string; actorId: string; tenantId: string; reason: string },
) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Từ chối yêu cầu phải có lý do.");
  return db.$transaction(async (tx) => {
    await lockRequestAndRoom(tx, input);
    const req = await tx.roomRequest.findFirstOrThrow({
      where: { id: input.requestId, tenantId: input.tenantId },
    });
    if (req.status !== "PENDING_APPROVAL") throw new Error("Yêu cầu không còn chờ duyệt.");
    const transition = transitionRoomRequest(req.status, "REJECTED");
    if (!transition.ok) throw transition.error;
    await tx.roomRequest.update({
      where: { id: req.id },
      data: {
        status: transition.value,
        decisionReason: reason,
        resolvedBy: input.actorId,
        resolvedAt: new Date(),
      },
    });
    await tx.notification.create({
      data: {
        tenantId: input.tenantId,
        userId: req.requestedBy,
        type: "ROOM_REQUEST_REJECTED",
        title: "Yêu cầu phòng bị từ chối",
        body: reason,
        entityType: "RoomRequest",
        entityId: req.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: "ROOM_REJECT",
        entityType: "RoomRequest",
        entityId: req.id,
        requestId: randomUUID(),
        afterJson: { reason },
      },
    });
    return { requestId: req.id, status: transition.value, reason };
  });
}
