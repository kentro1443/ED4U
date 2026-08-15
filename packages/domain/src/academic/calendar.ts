export const EVENT_VISIBILITY = ["SCHOOL", "GRADE", "CLASS", "CLUB", "PRIVATE"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITY)[number];

export const CALENDAR_SOURCES = [
  "TIMETABLE",
  "APPOINTMENT",
  "MENTOR_BOOKING",
  "CLUB_EVENT",
  "SCHOOL_EVENT",
  "ROOM_BOOKING",
] as const;
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];

export interface CalendarViewer {
  userId: string;
  roles: readonly string[];
  classId: string | null;
  grade: string | null;
  clubIds: readonly string[];
}

export interface RawCalendarSource {
  id: string;
  source: CalendarSource;
  title: string;
  startAt: Date;
  endAt: Date;
  visibility: EventVisibility;
  ownerUserId?: string | null;
  classId?: string | null;
  grade?: string | null;
  clubId?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  roomId?: string | null;
  /** True only for persisted CalendarEvent rows — never for timetable. */
  persistedEventRow: boolean;
}

export interface CalendarProjectionItem {
  id: string;
  source: CalendarSource;
  title: string;
  startAt: Date;
  endAt: Date;
  visibility: EventVisibility;
  roomId: string | null;
  persistedEventRow: boolean;
}

/**
 * Unified calendar is a projection. Timetable rows must never be written as
 * CalendarEvent rows; they appear here with persistedEventRow = false.
 */
export function projectCalendar(sources: readonly RawCalendarSource[]): CalendarProjectionItem[] {
  return sources.map((s) => ({
    id: s.id,
    source: s.source,
    title: s.title,
    startAt: s.startAt,
    endAt: s.endAt,
    visibility: s.visibility,
    roomId: s.roomId ?? null,
    persistedEventRow: s.source === "TIMETABLE" ? false : s.persistedEventRow,
  }));
}

export function timetableDuplicatedAsEvents(items: readonly CalendarProjectionItem[]): boolean {
  return items.some((i) => i.source === "TIMETABLE" && i.persistedEventRow);
}

export function isVisibleTo(item: RawCalendarSource, viewer: CalendarViewer): boolean {
  // A direct participant always sees their own projected item. This matters for
  // a teacher's CLASS-scoped timetable entry: the teacher is not a member of the
  // class, but is still one of the people the event belongs to.
  if (
    item.ownerUserId === viewer.userId ||
    item.teacherId === viewer.userId ||
    item.studentId === viewer.userId
  ) {
    return true;
  }

  if (viewer.roles.includes("SCHOOL_ADMIN") || viewer.roles.includes("ADMIN_IT")) {
    if (item.visibility === "PRIVATE") {
      return (
        item.ownerUserId === viewer.userId ||
        item.teacherId === viewer.userId ||
        item.studentId === viewer.userId
      );
    }
    return true;
  }

  switch (item.visibility) {
    case "SCHOOL":
      return true;
    case "GRADE":
      return item.grade != null && item.grade === viewer.grade;
    case "CLASS":
      return item.classId != null && item.classId === viewer.classId;
    case "CLUB":
      return item.clubId != null && viewer.clubIds.includes(item.clubId);
    case "PRIVATE":
      return (
        item.ownerUserId === viewer.userId ||
        item.teacherId === viewer.userId ||
        item.studentId === viewer.userId
      );
    default: {
      const _x: never = item.visibility;
      return _x;
    }
  }
}

export function filterVisible(
  sources: readonly RawCalendarSource[],
  viewer: CalendarViewer,
): CalendarProjectionItem[] {
  return projectCalendar(sources.filter((s) => isVisibleTo(s, viewer)));
}

export type CalendarView = "DAY" | "WEEK" | "MONTH";

export function inView(item: CalendarProjectionItem, view: CalendarView, anchor: Date): boolean {
  const start = startOfView(view, anchor);
  const end = endOfView(view, anchor);
  return item.startAt < end && item.endAt > start;
}

export function startOfView(view: CalendarView, anchor: Date): Date {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  if (view === "DAY") return d;
  if (view === "WEEK") {
    const day = d.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + mondayOffset);
    return d;
  }
  d.setDate(1);
  return d;
}

export function endOfView(view: CalendarView, anchor: Date): Date {
  const start = startOfView(view, anchor);
  const end = new Date(start);
  if (view === "DAY") {
    end.setDate(end.getDate() + 1);
  } else if (view === "WEEK") {
    end.setDate(end.getDate() + 7);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}
