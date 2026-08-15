import { filterVisible, projectCalendar, type RawCalendarSource } from "@ed4u/domain";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { requireActor } from "@/lib/authz";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const actor = await requireActor();
  const view = ((await searchParams).view ?? "week").toUpperCase();
  const [entries, events, appointments, bookings] = await Promise.all([
    db.timetableEntry.findMany({
      where: { tenantId: actor.tenantId },
      include: { subject: true, period: true, class: true },
      take: 40,
    }),
    db.schoolEvent.findMany({ where: { tenantId: actor.tenantId } }),
    db.appointment.findMany({
      where: { tenantId: actor.tenantId, status: "ACCEPTED" },
    }),
    db.roomBooking.findMany({ where: { tenantId: actor.tenantId, cancelledAt: null }, take: 20 }),
  ]);

  const sources: RawCalendarSource[] = [
    ...entries.map((e) => ({
      id: e.id,
      source: "TIMETABLE" as const,
      title: `${e.subject.name} · ${e.class.code}`,
      startAt: new Date(),
      endAt: new Date(),
      visibility: "CLASS" as const,
      classId: e.classId,
      persistedEventRow: false,
    })),
    ...events.map((e) => ({
      id: e.id,
      source: "SCHOOL_EVENT" as const,
      title: e.title,
      startAt: e.startAt,
      endAt: e.endAt,
      visibility: e.visibility,
      classId: e.classId,
      grade: e.grade,
      clubId: e.clubId,
      persistedEventRow: true,
    })),
    ...appointments.map((a) => ({
      id: a.id,
      source: "APPOINTMENT" as const,
      title: a.title,
      startAt: a.startAt,
      endAt: a.endAt,
      visibility: "PRIVATE" as const,
      studentId: a.studentId,
      teacherId: a.teacherId,
      persistedEventRow: false,
    })),
    ...bookings.map((b) => ({
      id: b.id,
      source: "ROOM_BOOKING" as const,
      title: "Đặt phòng",
      startAt: b.startAt,
      endAt: b.endAt,
      visibility: "SCHOOL" as const,
      roomId: b.roomId,
      persistedEventRow: false,
    })),
  ];

  const items = filterVisible(sources, {
    userId: actor.userId,
    roles: actor.roles,
    classId: actor.classId,
    grade: actor.grade,
    clubIds: [],
  });
  const projected = projectCalendar(items);

  return (
    <div>
      <PageHeader
        title="Lịch"
        description="Chiếu từ TKB + hẹn + mentor + sự kiện + phòng. TKB không nhân bản thành event."
      />
      <div className="flex gap-2">
        {["day", "week", "month"].map((v) => (
          <a
            key={v}
            href={`/calendar?view=${v}`}
            className={`rounded-full px-3 py-1 text-sm ${view.toLowerCase() === v ? "bg-[var(--pine)] text-white" : "border border-[var(--line)]"}`}
          >
            {v}
          </a>
        ))}
      </div>
      <ul className="mt-6 space-y-2">
        {projected.map((i) => (
          <li
            key={`${i.source}-${i.id}`}
            className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm"
          >
            <span className="text-xs uppercase text-[var(--muted)]">{i.source}</span> · {i.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
