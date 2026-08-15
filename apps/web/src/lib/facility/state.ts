import type { PrismaClient } from "@/generated/prisma/client";
import type { SchoolState } from "@ed4u/facility-engine";
import {
  civilDateKey,
  civilDateTimeToInstant,
  civilInZone,
  isSoftHoldActive,
  occupiedInterval,
  periodOccurrence,
} from "@ed4u/domain";

const DAY_CODE = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

export interface FacilityStateContext {
  state: SchoolState;
  timeZone: string;
  day: "MON" | "TUE" | "WED" | "THU" | "FRI";
  dayStart: Date;
  dayEnd: Date;
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Ngày phải có định dạng YYYY-MM-DD.");
  const value = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const probe = new Date(Date.UTC(value.year, value.month - 1, value.day, 12));
  if (
    probe.getUTCFullYear() !== value.year ||
    probe.getUTCMonth() + 1 !== value.month ||
    probe.getUTCDate() !== value.day
  ) {
    throw new Error("Ngày không hợp lệ.");
  }
  return value;
}

/**
 * Facility Engine V1 intentionally reasons in school-local civil clock values.
 * Its ISO strings are a transport encoding for that civil clock, not DB instants.
 * This adapter is the single boundary that converts real persisted instants into
 * that canonical representation.
 */
export function instantToFacilityCivilIso(instant: Date, timeZone: string): string {
  const civil = civilInZone(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${civil.year}-${pad(civil.month)}-${pad(civil.day)}T${pad(civil.hour)}:${pad(civil.minute)}:00.000Z`;
}

export function facilityCivilIsoToInstant(civilIso: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(civilIso);
  if (!match) throw new Error("Facility Engine returned an invalid civil timestamp.");
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

export async function buildFacilitySchoolState(
  db: PrismaClient,
  input: { tenantId: string; date: string; now?: Date },
): Promise<FacilityStateContext> {
  const date = parseDate(input.date);
  const now = input.now ?? new Date();
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: input.tenantId },
    select: { timezone: true },
  });
  const timeZone = tenant.timezone;
  const midday = civilDateTimeToInstant({ ...date, hour: 12, minute: 0 }, timeZone);
  const weekdayIndex = civilInZone(midday, timeZone).weekday;
  const day = DAY_CODE[weekdayIndex];
  if (day === "SUN" || day === "SAT")
    throw new Error("Facility Engine V1 chỉ nhận ngày thứ Hai–thứ Sáu.");

  const dayStart = civilDateTimeToInstant({ ...date, hour: 0, minute: 0 }, timeZone);
  const tomorrowCivil = new Date(Date.UTC(date.year, date.month - 1, date.day + 1, 12));
  const dayEnd = civilDateTimeToInstant(
    {
      year: tomorrowCivil.getUTCFullYear(),
      month: tomorrowCivil.getUTCMonth() + 1,
      day: tomorrowCivil.getUTCDate(),
      hour: 0,
      minute: 0,
    },
    timeZone,
  );

  const [rooms, hours, timetable, semesters, bookings, blocks, pending] = await Promise.all([
    db.room.findMany({
      where: { tenantId: input.tenantId },
      include: { roomType: true, features: { include: { feature: true } } },
      orderBy: { code: "asc" },
    }),
    db.operationalHours.findUnique({ where: { tenantId: input.tenantId } }),
    db.timetableEntry.findMany({
      where: { tenantId: input.tenantId, weekday: day },
      include: { period: true, class: true, subject: true },
    }),
    db.semester.findMany({ where: { year: { tenantId: input.tenantId } } }),
    db.roomBooking.findMany({
      where: {
        tenantId: input.tenantId,
        cancelledAt: null,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      include: { room: true },
    }),
    db.roomBlock.findMany({
      where: {
        tenantId: input.tenantId,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      include: { room: true },
    }),
    db.roomRequest.findMany({
      where: {
        tenantId: input.tenantId,
        status: "PENDING_APPROVAL",
        eventStart: { lt: dayEnd },
        eventEnd: { gt: dayStart },
      },
    }),
  ]);

  const semesterById = new Map(
    semesters.map((semester) => [
      semester.id,
      {
        start: civilDateKey(civilInZone(semester.startsOn, timeZone)),
        end: civilDateKey(civilInZone(semester.endsOn, timeZone)),
      },
    ]),
  );
  const occupancy: SchoolState["occupancy"] = [];
  for (const entry of timetable) {
    const semester = semesterById.get(entry.semesterId);
    if (semester && (input.date < semester.start || input.date > semester.end)) continue;
    const occurrence = periodOccurrence({
      anchor: midday,
      weekday: entry.weekday,
      startTime: entry.period.startTime,
      endTime: entry.period.endTime,
      timeZone,
    });
    occupancy.push({
      roomId: entry.roomId,
      startAt: instantToFacilityCivilIso(occurrence.startAt, timeZone),
      endAt: instantToFacilityCivilIso(occurrence.endAt, timeZone),
      kind: "TIMETABLE",
      label: `${entry.class.code} · ${entry.subject.name}`,
    });
  }
  for (const booking of bookings) {
    occupancy.push({
      roomId: booking.roomId,
      startAt: instantToFacilityCivilIso(booking.startAt, timeZone),
      endAt: instantToFacilityCivilIso(booking.endAt, timeZone),
      kind: "CONFIRMED_BOOKING",
      label: `Booking ${booking.room.code}`,
    });
  }
  for (const block of blocks) {
    occupancy.push({
      roomId: block.roomId,
      startAt: instantToFacilityCivilIso(block.startAt, timeZone),
      endAt: instantToFacilityCivilIso(block.endAt, timeZone),
      kind: "MAINTENANCE_BLOCK",
      label: block.reason,
    });
  }

  const pendingHolds: SchoolState["pendingHolds"] = pending.map((request) => {
    const occupied = occupiedInterval(
      request.eventStart,
      request.eventEnd,
      request.setupMinutes,
      request.cleanupMinutes,
    );
    return {
      requestId: request.id,
      roomId: request.roomId,
      startAt: instantToFacilityCivilIso(occupied.startAt, timeZone),
      endAt: instantToFacilityCivilIso(occupied.endAt, timeZone),
      createdAt: request.holdCreatedAt.toISOString(),
      active: isSoftHoldActive(
        {
          requestId: request.id,
          roomId: request.roomId,
          startAt: occupied.startAt,
          endAt: occupied.endAt,
          createdAt: request.holdCreatedAt,
        },
        now,
      ),
    };
  });

  return {
    timeZone,
    day,
    dayStart,
    dayEnd,
    state: {
      dateForDay: input.date,
      rooms: rooms.map((room) => ({
        id: room.id,
        code: room.code,
        name: room.name,
        roomType: room.roomType.code,
        building: room.building,
        floor: room.floor,
        capacity: room.capacity,
        status: room.status,
        features: Object.fromEntries(
          room.features.map((feature) => {
            const raw = feature.value;
            const value =
              raw === "true"
                ? true
                : raw === "false"
                  ? false
                  : /^\d+(\.\d+)?$/.test(raw)
                    ? Number(raw)
                    : raw;
            return [feature.feature.code, value];
          }),
        ),
      })),
      occupancy,
      pendingHolds,
      hours: {
        startMinutes: hours?.startMinutes ?? 7 * 60,
        endMinutes: hours?.endMinutes ?? 20 * 60,
        weekdaysOnly: true,
      },
    },
  };
}
