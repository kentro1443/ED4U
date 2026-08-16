"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { can, civilDateKey, civilInZone, transitionRoomRequest } from "@ed4u/domain";
import { planRooms, type PlanningRequest } from "@ed4u/facility-engine";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { buildFacilitySchoolState, facilityCivilIsoToInstant } from "@/lib/facility/state";
import { buildFacilityRoomMap } from "@/lib/facility/room-map";
import { nextFacilityDateForDay } from "@/lib/facility/parser";
import { parseFacilityPromptWithGemini } from "@/lib/facility/gemini-parser";

const FacilityPlanInputSchema = z.object({
  rawText: z.string().trim().min(3).max(1000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attendees: z.number().int().min(1).max(5000),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  requiredFeatures: z.array(z.string()).max(20),
  preferredRoomType: z.string().nullable().optional(),
  preferredBuilding: z.string().nullable().optional(),
  flexible: z.boolean(),
});
export type FacilityPlanInput = z.infer<typeof FacilityPlanInputSchema>;

function clockMinutes(clock: string): number {
  const [hour, minute] = clock.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

export async function parseFacilityPromptAction(rawText: string) {
  const actor = await requireActor();
  if (!can(actor, "room.request") && !can(actor, "rooms.manage")) {
    return { ok: false as const, error: "Bạn không có quyền sử dụng bộ lập kế hoạch phòng." };
  }
  const prompt = z.string().trim().min(3).max(1000).safeParse(rawText);
  if (!prompt.success) return { ok: false as const, error: "Mô tả phòng phải có từ 3–1000 ký tự." };

  try {
    const [tenant, roomTypes, features, buildings] = await Promise.all([
      db.tenant.findUniqueOrThrow({
        where: { id: actor.tenantId },
        select: { timezone: true },
      }),
      db.roomType.findMany({
        where: { tenantId: actor.tenantId },
        select: { code: true },
        orderBy: { code: "asc" },
      }),
      db.roomFeatureDefinition.findMany({
        where: { tenantId: actor.tenantId },
        select: { code: true },
        orderBy: { code: "asc" },
      }),
      db.room.findMany({
        where: { tenantId: actor.tenantId },
        select: { building: true },
        distinct: ["building"],
        orderBy: { building: "asc" },
      }),
    ]);
    const parsed = await parseFacilityPromptWithGemini({
      rawText: prompt.data,
      localToday: civilDateKey(civilInZone(new Date(), tenant.timezone)),
      timeZone: tenant.timezone,
      allowedRoomTypes: roomTypes.map((item) => item.code),
      allowedFeatures: features.map((item) => item.code),
      allowedBuildings: buildings.map((item) => item.building),
    });
    return {
      ok: true as const,
      data: {
        ...parsed,
        suggestedDate:
          parsed.date ?? (parsed.day ? nextFacilityDateForDay(parsed.day, tenant.timezone) : null),
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? `${error.message} Bạn vẫn có thể nhập tiêu chí thủ công; Facility Engine chưa được chạy.`
          : "Gemini không thể phân tích yêu cầu. Hãy nhập tiêu chí thủ công.",
    };
  }
}

export async function planFacilityAction(rawInput: FacilityPlanInput) {
  const actor = await requireActor();
  if (!can(actor, "room.request") && !can(actor, "rooms.manage")) {
    return { ok: false as const, error: "Bạn không có quyền lập kế hoạch phòng." };
  }
  const parsed = FacilityPlanInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false as const, error: "Tiêu chí phòng chưa hợp lệ." };
  if (clockMinutes(parsed.data.end) <= clockMinutes(parsed.data.start)) {
    return { ok: false as const, error: "Giờ kết thúc phải sau giờ bắt đầu." };
  }

  try {
    const context = await buildFacilitySchoolState(db, {
      tenantId: actor.tenantId,
      date: parsed.data.date,
    });
    const request: PlanningRequest = {
      requestId: randomUUID(),
      attendees: parsed.data.attendees,
      requiredFeatures: parsed.data.requiredFeatures,
      ...(parsed.data.preferredRoomType
        ? { preferredRoomType: parsed.data.preferredRoomType }
        : {}),
      ...(parsed.data.preferredBuilding
        ? { preferredBuilding: parsed.data.preferredBuilding }
        : {}),
      day: context.day,
      timeWindow: {
        start: parsed.data.start,
        end: parsed.data.end,
        flexible: parsed.data.flexible,
      },
      setupMinutes: 15,
      cleanupMinutes: 15,
    };
    const result = planRooms(context.state, request);
    return {
      ok: true as const,
      result,
      request,
      roomMap: buildFacilityRoomMap(context.state, request, result),
      stateSummary: {
        rooms: context.state.rooms.length,
        hardOccupancy: context.state.occupancy.length,
        activeSoftHolds: context.state.pendingHolds.filter((hold) => hold.active).length,
        timeZone: context.timeZone,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể lập kế hoạch phòng.",
    };
  }
}

export async function createRoomRequestFromPlanAction(input: {
  criteria: FacilityPlanInput;
  roomId: string;
  clubEventId?: string | null;
}) {
  const actor = await requireActor();
  if (
    !can(actor, "room.request") ||
    actor.memberType !== "STUDENT" ||
    actor.membershipStatus !== "ACTIVE"
  ) {
    return { ok: false as const, error: "Chỉ học sinh đang theo học mới được gửi yêu cầu phòng." };
  }
  const parsed = FacilityPlanInputSchema.safeParse(input.criteria);
  if (!parsed.success) return { ok: false as const, error: "Tiêu chí phòng không hợp lệ." };

  try {
    let clubEventId: string | null = null;
    if (input.clubEventId) {
      const event = await db.clubEvent.findFirst({
        where: { id: input.clubEventId, club: { tenantId: actor.tenantId } },
        include: {
          club: { include: { members: { where: { userId: actor.userId, status: "ACTIVE" } } } },
        },
      });
      if (!event || !event.roomRequired)
        throw new Error("Sự kiện CLB không hợp lệ hoặc không cần phòng.");
      const member = event.club.members[0];
      if (
        !actor.roles.includes("SCHOOL_ADMIN") &&
        (!member || !["PRESIDENT", "VICE_PRESIDENT", "CORE"].includes(member.role))
      ) {
        throw new Error("Bạn không có quyền tìm phòng cho sự kiện này.");
      }
      clubEventId = event.id;
    }
    const context = await buildFacilitySchoolState(db, {
      tenantId: actor.tenantId,
      date: parsed.data.date,
    });
    const request: PlanningRequest = {
      requestId: randomUUID(),
      attendees: parsed.data.attendees,
      requiredFeatures: parsed.data.requiredFeatures,
      ...(parsed.data.preferredRoomType
        ? { preferredRoomType: parsed.data.preferredRoomType }
        : {}),
      ...(parsed.data.preferredBuilding
        ? { preferredBuilding: parsed.data.preferredBuilding }
        : {}),
      day: context.day,
      timeWindow: {
        start: parsed.data.start,
        end: parsed.data.end,
        flexible: parsed.data.flexible,
      },
      setupMinutes: 15,
      cleanupMinutes: 15,
    };
    const result = planRooms(context.state, request);
    if (result.kind !== "PLANS") {
      return {
        ok: false as const,
        error: "Trạng thái phòng đã thay đổi; hiện không còn phương án khả thi.",
      };
    }
    const selectedPlan = result.plans.find((plan) => plan.roomId === input.roomId);
    if (!selectedPlan) {
      return {
        ok: false as const,
        error: "Phòng đã chọn không còn nằm trong phương án khả thi hiện tại.",
      };
    }
    const eventStart = facilityCivilIsoToInstant(selectedPlan.startAt, context.timeZone);
    const eventEnd = facilityCivilIsoToInstant(selectedPlan.endAt, context.timeZone);

    const existing = await db.roomRequest.findFirst({
      where: {
        tenantId: actor.tenantId,
        requestedBy: actor.userId,
        roomId: input.roomId,
        status: "PENDING_APPROVAL",
        eventStart,
        eventEnd,
      },
      select: { id: true },
    });
    if (existing) return { ok: true as const, requestId: existing.id, duplicate: true };

    const roomRequest = await db.$transaction(async (tx) => {
      const created = await tx.roomRequest.create({
        data: {
          tenantId: actor.tenantId,
          roomId: input.roomId,
          requestedBy: actor.userId,
          status: "PENDING_APPROVAL",
          eventStart,
          eventEnd,
          setupMinutes: request.setupMinutes ?? 15,
          cleanupMinutes: request.cleanupMinutes ?? 15,
          holdCreatedAt: new Date(),
          purpose: parsed.data.rawText,
          recommendation: {
            schemaVersion: "facility-recommendation.v1",
            engineVersion: result.engineVersion,
            request: {
              requestId: request.requestId,
              attendees: request.attendees,
              requiredFeatures: [...request.requiredFeatures],
              preferredRoomType: request.preferredRoomType ?? null,
              preferredBuilding: request.preferredBuilding ?? null,
              day: request.day,
              timeWindow: { ...request.timeWindow },
              setupMinutes: request.setupMinutes ?? 15,
              cleanupMinutes: request.cleanupMinutes ?? 15,
            },
            selectedPlan: {
              ...selectedPlan,
              soft: { ...selectedPlan.soft },
              reasons: [...selectedPlan.reasons],
              tradeoffs: [...selectedPlan.tradeoffs],
            },
            stateSummary: {
              occupancyCount: context.state.occupancy.length,
              activeSoftHolds: context.state.pendingHolds.filter((hold) => hold.active).length,
            },
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
            type: "ROOM_REQUEST_PENDING",
            title: "Có yêu cầu phòng mới",
            body: `${actor.schoolMemberCode} gửi yêu cầu cho một phòng đã được Facility Engine đề xuất.`,
            entityType: "RoomRequest",
            entityId: created.id,
          })),
        });
      }
      if (clubEventId) {
        await tx.clubEvent.update({
          where: { id: clubEventId },
          data: { roomRequestId: created.id, roomResolved: false, status: "PENDING" },
        });
      }
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "ROOM_REQUEST_CREATE",
          entityType: "RoomRequest",
          entityId: created.id,
          requestId: randomUUID(),
          afterJson: {
            roomId: input.roomId,
            eventStart: eventStart.toISOString(),
            eventEnd: eventEnd.toISOString(),
          },
        },
      });
      return created;
    });
    return { ok: true as const, requestId: roomRequest.id, duplicate: false };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể gửi yêu cầu phòng.",
    };
  }
}

export async function cancelRoomRequestAction(requestId: string) {
  const actor = await requireActor();
  if (!can(actor, "room.request"))
    return { ok: false as const, error: "Bạn không có quyền hủy yêu cầu phòng." };
  try {
    await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; roomId: string }>>`
        SELECT "id"::text, "roomId"::text
        FROM "RoomRequest"
        WHERE "id"=${requestId} AND "tenantId"=${actor.tenantId}
        FOR UPDATE
      `;
      const locked = rows[0];
      if (!locked) throw new Error("Không tìm thấy yêu cầu phòng.");
      await tx.$queryRaw`SELECT "id"::text FROM "Room" WHERE "id"=${locked.roomId} FOR UPDATE`;
      const request = await tx.roomRequest.findFirstOrThrow({
        where: { id: requestId, tenantId: actor.tenantId },
        include: { booking: true },
      });
      if (request.requestedBy !== actor.userId)
        throw new Error("Yêu cầu phòng không thuộc tài khoản của bạn.");
      if (!["PENDING_APPROVAL", "CHANGES_REQUESTED", "APPROVED"].includes(request.status)) {
        throw new Error("Yêu cầu không còn có thể hủy.");
      }
      const transition = transitionRoomRequest(request.status, "CANCELLED");
      if (!transition.ok) throw transition.error;
      const now = new Date();
      if (request.booking && !request.booking.cancelledAt) {
        await tx.roomBooking.update({
          where: { id: request.booking.id },
          data: { cancelledAt: now },
        });
      }
      await tx.roomRequest.update({
        where: { id: request.id },
        data: { status: transition.value, resolvedBy: actor.userId, resolvedAt: now },
      });
      await tx.clubEvent.updateMany({
        where: { roomRequestId: request.id },
        data: { roomResolved: false, status: "NEEDS_RESOURCE" },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "ROOM_REQUEST_CANCEL",
          entityType: "RoomRequest",
          entityId: request.id,
          requestId: randomUUID(),
          afterJson: { status: transition.value, bookingCancelled: !!request.booking },
        },
      });
    });
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể hủy yêu cầu phòng.",
    };
  }
}
