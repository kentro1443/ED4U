import { can, filterVisible, type RawCalendarSource } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { SchoolEventCreate, SchoolEventDelete } from "@/features/events/SchoolEventControls";

function localTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function EventsPage() {
  const actor = await requireActor();
  const [tenant, events, classes, clubMemberships] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: actor.tenantId }, select: { timezone: true } }),
    db.schoolEvent.findMany({ where: { tenantId: actor.tenantId }, orderBy: { startAt: "asc" } }),
    db.class.findMany({
      where: { tenantId: actor.tenantId },
      select: { id: true, code: true, grade: true },
      orderBy: { code: "asc" },
    }),
    db.clubMembership.findMany({
      where: { userId: actor.userId, status: "ACTIVE", club: { tenantId: actor.tenantId } },
      select: { clubId: true },
    }),
  ]);
  const sources: RawCalendarSource[] = events.map((event) => ({
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
  }));
  const visibleIds = new Set(
    filterVisible(sources, {
      userId: actor.userId,
      roles: actor.roles,
      classId: actor.classId,
      grade: actor.grade,
      clubIds: clubMemberships.map((membership) => membership.clubId),
    }).map((event) => event.id),
  );
  const visibleEvents = events.filter((event) => visibleIds.has(event.id));
  const canManage = can(actor, "events.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sự kiện trường"
        description="Lịch sự kiện theo visibility toàn trường / khối / lớp. Các sự kiện này được chiếu trực tiếp vào Calendar thống nhất."
      />
      {canManage ? <SchoolEventCreate classes={classes} /> : null}

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--ink)]">Sự kiện bạn có thể xem</h2>
        {visibleEvents.length === 0 ? (
          <EmptyState
            title="Chưa có sự kiện"
            description="Không có sự kiện nào nằm trong phạm vi hiển thị của tài khoản này."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleEvents.map((event) => (
              <Card key={event.id} data-testid="school-event-card" className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-[var(--ink)]">{event.title}</h3>
                  <Badge tone="neutral">{event.visibility}</Badge>
                </div>
                <p className="mt-3 text-xs text-[var(--body)]">
                  {localTime(event.startAt, tenant.timezone)} →{" "}
                  {localTime(event.endAt, tenant.timezone)}
                </p>
                {event.grade ? (
                  <p className="mt-1 text-[11px] text-[var(--muted)]">Khối {event.grade}</p>
                ) : null}
                {event.classId ? (
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    Lớp {classes.find((klass) => klass.id === event.classId)?.code ?? event.classId}
                  </p>
                ) : null}
                {canManage ? (
                  <div className="mt-4">
                    <SchoolEventDelete eventId={event.id} title={event.title} />
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
