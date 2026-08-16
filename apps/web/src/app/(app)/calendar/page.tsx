import Link from "next/link";
import {
  addCivilDays,
  civilDateKey,
  civilDateTimeToInstant,
  civilInZone,
  filterVisible,
  periodOccurrence,
  schoolWeekMonday,
  type RawCalendarSource,
} from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Icons } from "@/components/ui/icons";
import {
  CalendarLegend,
  DayCalendar,
  MonthCalendar,
  WeekCalendar,
  type CalendarViewItem,
} from "@/features/calendar/CalendarViews";

const VIEW_LABEL = { day: "Ngày", week: "Tuần", month: "Tháng" } as const;
type View = keyof typeof VIEW_LABEL;

function parseView(value: string | undefined): View {
  return value === "day" || value === "month" ? value : "week";
}

function parseLocalDate(
  value: string | undefined,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  )
    return null;
  return { year, month, day };
}

function anchorFromQuery(date: string | undefined, timeZone: string): Date {
  const parsed = parseLocalDate(date);
  if (!parsed) return new Date();
  return civilDateTimeToInstant({ ...parsed, hour: 12, minute: 0 }, timeZone);
}

function viewRange(view: View, anchor: Date, timeZone: string): { start: Date; end: Date } {
  const local = civilInZone(anchor, timeZone);
  if (view === "day") {
    const date = { year: local.year, month: local.month, day: local.day };
    const next = addCivilDays(date, 1);
    return {
      start: civilDateTimeToInstant({ ...date, hour: 0, minute: 0 }, timeZone),
      end: civilDateTimeToInstant({ ...next, hour: 0, minute: 0 }, timeZone),
    };
  }
  if (view === "week") {
    const monday = schoolWeekMonday(anchor, timeZone);
    const next = addCivilDays(monday, 7);
    return {
      start: civilDateTimeToInstant({ ...monday, hour: 0, minute: 0 }, timeZone),
      end: civilDateTimeToInstant({ ...next, hour: 0, minute: 0 }, timeZone),
    };
  }
  const first = { year: local.year, month: local.month, day: 1 };
  const nextMonth =
    local.month === 12
      ? { year: local.year + 1, month: 1, day: 1 }
      : { year: local.year, month: local.month + 1, day: 1 };
  return {
    start: civilDateTimeToInstant({ ...first, hour: 0, minute: 0 }, timeZone),
    end: civilDateTimeToInstant({ ...nextMonth, hour: 0, minute: 0 }, timeZone),
  };
}

function shiftAnchor(anchor: Date, view: View, amount: number, timeZone: string): string {
  const local = civilInZone(anchor, timeZone);
  if (view === "month") {
    const monthIndex = local.year * 12 + (local.month - 1) + amount;
    const year = Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    return civilDateKey({ year, month, day: 1 });
  }
  const date = addCivilDays(local, amount * (view === "week" ? 7 : 1));
  return civilDateKey(date);
}

function titleForAnchor(view: View, anchor: Date, timeZone: string): string {
  if (view === "month") {
    return new Intl.DateTimeFormat("vi-VN", { timeZone, month: "long", year: "numeric" }).format(
      anchor,
    );
  }
  if (view === "day") {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone,
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(anchor);
  }
  const monday = schoolWeekMonday(anchor, timeZone);
  const sunday = addCivilDays(monday, 6);
  return `${String(monday.day).padStart(2, "0")}/${String(monday.month).padStart(2, "0")} – ${String(sunday.day).padStart(2, "0")}/${String(sunday.month).padStart(2, "0")}/${sunday.year}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const view = parseView(params.view);
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: actor.tenantId },
    select: { timezone: true },
  });
  const timeZone = tenant.timezone;
  const anchor = anchorFromQuery(params.date, timeZone);
  const range = viewRange(view, anchor, timeZone);

  const [clubMemberships, mentorProfile, semesters] = await Promise.all([
    db.clubMembership.findMany({
      where: { userId: actor.userId, status: "ACTIVE", club: { tenantId: actor.tenantId } },
      select: { clubId: true },
    }),
    db.mentorProfile.findFirst({
      where: { tenantId: actor.tenantId, userId: actor.userId },
      select: { id: true },
    }),
    db.semester.findMany({ where: { year: { tenantId: actor.tenantId } } }),
  ]);
  const clubIds = clubMemberships.map((membership) => membership.clubId);

  const timetableWhere =
    actor.roles.includes("SCHOOL_ADMIN") || actor.roles.includes("ADMIN_IT")
      ? { tenantId: actor.tenantId }
      : actor.memberType === "TEACHER"
        ? { tenantId: actor.tenantId, teacherId: actor.userId }
        : actor.classId
          ? { tenantId: actor.tenantId, classId: actor.classId }
          : { tenantId: actor.tenantId, id: "__none__" };

  const mentorBookingOr = [
    { studentId: actor.userId },
    ...(mentorProfile ? [{ mentorId: mentorProfile.id }] : []),
  ];

  const [entries, schoolEvents, appointments, roomBookings, mentorBookings, clubEvents] =
    await Promise.all([
      db.timetableEntry.findMany({
        where: timetableWhere,
        include: { subject: true, period: true, class: true, room: true },
        orderBy: [{ weekday: "asc" }, { period: { sortOrder: "asc" } }],
      }),
      db.schoolEvent.findMany({
        where: { tenantId: actor.tenantId, startAt: { lt: range.end }, endAt: { gt: range.start } },
        orderBy: { startAt: "asc" },
      }),
      db.appointment.findMany({
        where: {
          tenantId: actor.tenantId,
          status: "ACCEPTED",
          OR: [{ studentId: actor.userId }, { teacherId: actor.userId }],
          startAt: { lt: range.end },
          endAt: { gt: range.start },
        },
        orderBy: { startAt: "asc" },
      }),
      db.roomBooking.findMany({
        where: {
          tenantId: actor.tenantId,
          cancelledAt: null,
          startAt: { lt: range.end },
          endAt: { gt: range.start },
        },
        include: { room: true },
        orderBy: { startAt: "asc" },
      }),
      db.mentorBooking.findMany({
        where: {
          tenantId: actor.tenantId,
          cancelledAt: null,
          OR: mentorBookingOr,
          startAt: { lt: range.end },
          endAt: { gt: range.start },
        },
        orderBy: { startAt: "asc" },
      }),
      db.clubEvent.findMany({
        where: {
          club: { tenantId: actor.tenantId },
          startAt: { lt: range.end },
          endAt: { gt: range.start },
        },
        include: { club: true },
        orderBy: { startAt: "asc" },
      }),
    ]);

  const semesterById = new Map(semesters.map((semester) => [semester.id, semester]));
  const sources: RawCalendarSource[] = [];
  const viewMonday = schoolWeekMonday(range.start, timeZone);
  for (let offset = 0; offset < 42; offset += 7) {
    const weekDate = addCivilDays(viewMonday, offset);
    const weekAnchor = civilDateTimeToInstant({ ...weekDate, hour: 12, minute: 0 }, timeZone);
    if (weekAnchor >= range.end) break;
    for (const entry of entries) {
      const occurrence = periodOccurrence({
        anchor: weekAnchor,
        weekday: entry.weekday,
        startTime: entry.period.startTime,
        endTime: entry.period.endTime,
        timeZone,
      });
      const semester = semesterById.get(entry.semesterId);
      if (semester) {
        const semesterStart = civilDateKey(civilInZone(semester.startsOn, timeZone));
        const semesterEnd = civilDateKey(civilInZone(semester.endsOn, timeZone));
        if (occurrence.localDate < semesterStart || occurrence.localDate > semesterEnd) continue;
      }
      if (occurrence.startAt >= range.end || occurrence.endAt <= range.start) continue;
      sources.push({
        id: `${entry.id}:${occurrence.localDate}`,
        source: "TIMETABLE",
        title: `${entry.subject.name} · ${entry.class.code}`,
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        visibility: "CLASS",
        classId: entry.classId,
        teacherId: entry.teacherId,
        roomId: entry.roomId,
        persistedEventRow: false,
      });
    }
  }

  sources.push(
    ...schoolEvents.map((event) => ({
      id: event.id,
      source: "SCHOOL_EVENT" as const,
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      visibility: event.visibility,
      classId: event.classId,
      grade: event.grade,
      clubId: event.clubId,
      persistedEventRow: true,
    })),
    ...appointments.map((appointment) => ({
      id: appointment.id,
      source: "APPOINTMENT" as const,
      title: appointment.title,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      visibility: "PRIVATE" as const,
      studentId: appointment.studentId,
      teacherId: appointment.teacherId,
      persistedEventRow: false,
    })),
    ...roomBookings.map((booking) => ({
      id: booking.id,
      source: "ROOM_BOOKING" as const,
      title: `Đặt phòng · ${booking.room.code}`,
      startAt: booking.startAt,
      endAt: booking.endAt,
      visibility: "SCHOOL" as const,
      roomId: booking.roomId,
      persistedEventRow: false,
    })),
    ...mentorBookings.map((booking) => ({
      id: booking.id,
      source: "MENTOR_BOOKING" as const,
      title: "Lịch mentoring",
      startAt: booking.startAt,
      endAt: booking.endAt,
      visibility: "PRIVATE" as const,
      studentId: booking.studentId,
      ownerUserId: mentorProfile?.id === booking.mentorId ? actor.userId : null,
      persistedEventRow: false,
    })),
    ...clubEvents.map((event) => ({
      id: event.id,
      source: "CLUB_EVENT" as const,
      title: `${event.title} · ${event.club.name}`,
      startAt: event.startAt,
      endAt: event.endAt,
      visibility: event.visibility,
      clubId: event.clubId,
      persistedEventRow: false,
    })),
  );

  const projected = filterVisible(sources, {
    userId: actor.userId,
    roles: actor.roles,
    classId: actor.classId,
    grade: actor.grade,
    clubIds,
  }).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const roomCodeById = new Map(roomBookings.map((booking) => [booking.roomId, booking.room.code]));
  for (const entry of entries) roomCodeById.set(entry.roomId, entry.room.code);
  const items: CalendarViewItem[] = projected.map((item) => ({
    id: item.id,
    source: item.source,
    title: item.title,
    startAt: item.startAt,
    endAt: item.endAt,
    roomLabel: item.roomId ? (roomCodeById.get(item.roomId) ?? null) : null,
  }));

  const todayKey = civilDateKey(civilInZone(new Date(), timeZone));
  const prev = shiftAnchor(anchor, view, -1, timeZone);
  const next = shiftAnchor(anchor, view, 1, timeZone);
  const anchorKey = civilDateKey(civilInZone(anchor, timeZone));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lịch"
        description={`Lịch thống nhất theo múi giờ trường (${timeZone}), chiếu trực tiếp từ TKB, lịch hẹn, mentoring, sự kiện và đặt phòng.`}
      />

      <section className="overflow-hidden rounded-[24px] border border-[var(--hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]">
        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href={`/calendar?view=${view}&date=${prev}`}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hairline)] text-[var(--body)] transition-colors hover:border-[var(--brand-100)] hover:bg-[var(--brand-50)] hover:text-[var(--primary)]"
                aria-label={`${VIEW_LABEL[view]} trước`}
              >
                <Icons.chevronLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href={`/calendar?view=${view}&date=${next}`}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hairline)] text-[var(--body)] transition-colors hover:border-[var(--brand-100)] hover:bg-[var(--brand-50)] hover:text-[var(--primary)]"
                aria-label={`${VIEW_LABEL[view]} sau`}
              >
                <Icons.chevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold tracking-[-0.025em] text-[var(--ink)] sm:text-xl">
                  {titleForAnchor(view, anchor, timeZone)}
                </h2>
                <Badge tone="neutral" size="sm">
                  {items.length} lịch
                </Badge>
              </div>
              <Link
                href={`/calendar?view=${view}&date=${todayKey}`}
                className="mt-1 inline-flex text-xs font-bold text-[var(--primary)] hover:underline"
              >
                Về hôm nay
              </Link>
            </div>
          </div>

          <nav
            className="inline-flex w-fit rounded-xl bg-[var(--surface-soft)] p-1"
            aria-label="Chế độ xem lịch"
          >
            {(Object.keys(VIEW_LABEL) as View[]).map((candidate) => (
              <Link
                key={candidate}
                href={`/calendar?view=${candidate}&date=${anchorKey}`}
                aria-current={view === candidate ? "page" : undefined}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${view === candidate ? "bg-[var(--surface-card)] text-[var(--primary)] shadow-[var(--shadow-sm)]" : "text-[var(--body)] hover:text-[var(--ink)]"}`}
              >
                {VIEW_LABEL[candidate]}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-t border-[var(--hairline-soft)] px-4 py-3 sm:px-5">
          <CalendarLegend />
        </div>
      </section>

      {/* The grid renders even when the range is empty. A calendar whose empty
          state replaces the whole grid stops being a calendar: the reader loses
          the days, the time gutter and their place in the week, and cannot tell
          an empty Tuesday from a failed load. */}
      {view === "day" ? (
        <DayCalendar items={items} anchor={anchor} timeZone={timeZone} />
      ) : view === "month" ? (
        <MonthCalendar items={items} anchor={anchor} timeZone={timeZone} />
      ) : (
        <WeekCalendar items={items} anchor={anchor} timeZone={timeZone} />
      )}

      {items.length === 0 ? (
        <p
          role="status"
          className="rounded-lg border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)]/60 px-4 py-3 text-center text-xs text-[var(--muted)]"
        >
          Không có lịch nào trong khoảng này. Thử chuyển sang ngày/tuần khác, hoặc kiểm tra các
          nguồn lịch ở chú giải phía trên.
        </p>
      ) : null}

      <p className="text-[11px] text-[var(--muted)]">
        Thời khóa biểu được chiếu động từ lịch học định kỳ; không tạo bản sao CalendarEvent. Lịch
        riêng tư chỉ hiển thị cho người tham gia.
      </p>
    </div>
  );
}
