import { filterVisible, projectCalendar, type RawCalendarSource } from "@ed4u/domain";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { NavPillTabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { requireActor } from "@/lib/authz";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const actor = await requireActor();
  const rawView = (await searchParams).view ?? "week";
  const view = rawView.toLowerCase();

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

  const viewTabs = [
    { label: "Ngày (Day)", href: "/calendar?view=day", active: view === "day" },
    { label: "Tuần (Week)", href: "/calendar?view=week", active: view === "week" },
    { label: "Tháng (Month)", href: "/calendar?view=month", active: view === "month" },
  ];

  const sourceTones: Record<string, "brand" | "neutral" | "success" | "warning"> = {
    TIMETABLE: "neutral",
    SCHOOL_EVENT: "brand",
    APPOINTMENT: "warning",
    ROOM_BOOKING: "success",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lịch"
        description="Chiếu trực tiếp từ Thời khóa biểu, Lịch hẹn, Mentor, Sự kiện trường và Đặt phòng. Thời khóa biểu không bị nhân bản thành dòng sự kiện tĩnh."
        actions={<NavPillTabs items={viewTabs} />}
      />

      <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-xs text-[var(--muted)]">
        <span className="font-semibold text-[var(--ink)]">Khung nhìn hiện tại:</span>{" "}
        {view.toUpperCase()} · Hiển thị nguồn dữ liệu hợp lệ theo quyền người dùng. Mô hình lưới
        thời gian chi tiết theo khung giờ học sẽ được triển khai ở phân đoạn Lịch.
      </div>

      {projected.length === 0 ? (
        <EmptyState
          title="Không có sự kiện"
          description="Chưa có mục lịch nào được chiếu cho tài khoản của bạn trong khoảng thời gian này."
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-[var(--hairline-soft)] text-sm">
            {projected.map((item) => (
              <li
                key={`${item.source}-${item.id}`}
                className="p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-soft)]/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge tone={sourceTones[item.source] ?? "neutral"} size="sm">
                    {item.source}
                  </Badge>
                  <span className="font-medium text-[var(--ink)]">{item.title}</span>
                </div>
                <span className="text-xs text-[var(--muted)] font-mono">
                  {item.source === "TIMETABLE" ? "Tiết học TKB" : "Sự kiện / Lịch hẹn"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
