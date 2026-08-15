import type {
  HardFailReason,
  OccupancyInterval,
  OperationalHours,
  PlanningRequest,
  RoomSnapshot,
} from "./types";

export function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function minutesOnDate(isoDate: string, hm: string): number {
  return parseHm(hm);
}

export function intervalIso(
  date: string,
  startHm: string,
  endHm: string,
): { startAt: string; endAt: string } {
  return { startAt: `${date}T${startHm}:00.000Z`, endAt: `${date}T${endHm}:00.000Z` };
}

function occMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function hardReject(
  room: RoomSnapshot,
  request: PlanningRequest,
  occupancy: readonly OccupancyInterval[],
  hours: OperationalHours,
  date: string,
): HardFailReason | null {
  if (room.status !== "ACTIVE") return "ROOM_NOT_ACTIVE";
  if (room.capacity < request.attendees) return "CAPACITY";
  for (const feat of request.requiredFeatures) {
    const value = room.features[feat];
    if (value === undefined || value === false || value === 0 || value === "false") {
      return "MISSING_FEATURE";
    }
  }

  const setup = request.setupMinutes ?? 0;
  const cleanup = request.cleanupMinutes ?? 0;
  const start = parseHm(request.timeWindow.start) - setup;
  const end = parseHm(request.timeWindow.end) + cleanup;

  if (hours.weekdaysOnly && !["MON", "TUE", "WED", "THU", "FRI"].includes(request.day)) {
    return "OUTSIDE_HOURS";
  }
  if (start < hours.startMinutes || end > hours.endMinutes) return "OUTSIDE_HOURS";

  for (const slot of occupancy) {
    if (slot.roomId !== room.id) continue;
    if (!slot.startAt.startsWith(date) && !new Date(slot.startAt).toISOString().startsWith(date)) {
      const slotDate = slot.startAt.slice(0, 10);
      if (slotDate !== date) continue;
    }
    const s = occMinutes(slot.startAt);
    const e = occMinutes(slot.endAt);
    if (overlaps(start, end, s, e)) {
      if (slot.kind === "TIMETABLE") return "TIMETABLE_CONFLICT";
      if (slot.kind === "CONFIRMED_BOOKING") return "CONFIRMED_BOOKING_CONFLICT";
      if (slot.kind === "MAINTENANCE_BLOCK") return "MAINTENANCE_BLOCK";
    }
  }

  if (!request.timeWindow.flexible) {
    // Exact time is already encoded as the only window we evaluate.
  }

  return null;
}
