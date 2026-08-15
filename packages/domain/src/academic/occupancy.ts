export interface TimeInterval {
  startAt: Date;
  endAt: Date;
}

export interface OccupiedSlot extends TimeInterval {
  source: "TIMETABLE" | "CONFIRMED_BOOKING" | "MAINTENANCE_BLOCK";
  roomId: string;
  label: string;
}

export function occupiedInterval(
  eventStart: Date,
  eventEnd: Date,
  setupMin: number,
  cleanupMin: number,
): TimeInterval {
  return {
    startAt: new Date(eventStart.getTime() - setupMin * 60_000),
    endAt: new Date(eventEnd.getTime() + cleanupMin * 60_000),
  };
}

export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

export function combineRoomOccupancy(parts: {
  roomId: string;
  timetable: readonly (TimeInterval & { label: string })[];
  confirmedBookings: readonly (TimeInterval & { label: string })[];
  blocks: readonly (TimeInterval & { label: string })[];
}): OccupiedSlot[] {
  const out: OccupiedSlot[] = [];
  for (const t of parts.timetable) {
    out.push({ ...t, roomId: parts.roomId, source: "TIMETABLE" });
  }
  for (const b of parts.confirmedBookings) {
    out.push({ ...b, roomId: parts.roomId, source: "CONFIRMED_BOOKING" });
  }
  for (const bl of parts.blocks) {
    out.push({ ...bl, roomId: parts.roomId, source: "MAINTENANCE_BLOCK" });
  }
  return out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

export function hasHardOccupancyConflict(
  candidate: TimeInterval,
  occupancy: readonly OccupiedSlot[],
): OccupiedSlot | null {
  for (const slot of occupancy) {
    if (intervalsOverlap(candidate, slot)) return slot;
  }
  return null;
}
