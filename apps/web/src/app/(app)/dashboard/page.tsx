import Link from "next/link";
import { can } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { PageHeader } from "@/components/PageHeader";

export default async function DashboardPage() {
  const actor = await requireActor();

  const isStudent = actor.roles.includes("STUDENT") && actor.membershipStatus === "ACTIVE";
  const isTeacher = actor.roles.includes("TEACHER");
  const isAdmin = can(actor, "approvals.resolve");
  const isIt = can(actor, "members.manage");

  // A student sees their own class's timetable; a teacher sees the periods they
  // teach. Neither sees the rest of the school.
  // TODO(slice-2): narrow to "today" once weekday + AcademicPeriod are resolved
  // into real datetimes in the school timezone.
  const timetableScope = isTeacher
    ? { tenantId: actor.tenantId, teacherId: actor.userId }
    : actor.classId
      ? { tenantId: actor.tenantId, classId: actor.classId }
      : null;

  const [periods, entries, approvals, appointments, events, notifications] = await Promise.all([
    db.academicPeriod.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { sortOrder: "asc" },
    }),
    timetableScope
      ? db.timetableEntry.findMany({
          where: timetableScope,
          include: { subject: true, period: true, class: true },
          orderBy: [{ weekday: "asc" }, { period: { sortOrder: "asc" } }],
        })
      : Promise.resolve([]),
    isAdmin
      ? db.approval.findMany({ where: { tenantId: actor.tenantId, status: "PENDING" }, take: 6 })
      : Promise.resolve([]),
    db.appointment.findMany({
      where: {
        tenantId: actor.tenantId,
        OR: [{ studentId: actor.userId }, { teacherId: actor.userId }],
      },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
    db.schoolEvent.findMany({ where: { tenantId: actor.tenantId }, take: 5 }),
    db.notification.findMany({
      where: { tenantId: actor.tenantId, userId: actor.userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        description="Bảng điều khiển theo vai trò — ED4U Demo High School"
      />
      <div className="grid gap-4 md:grid-cols-2">
        {(isStudent || isTeacher) && (
          <section
            className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-5"
            data-widget="timetable"
          >
            <h2 className="text-sm font-semibold">
              {isTeacher ? "Lịch dạy của bạn" : "Thời khóa biểu lớp"}
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {entries.length === 0 ? <li>Chưa có tiết.</li> : null}
              {entries.slice(0, 6).map((e) => (
                <li key={e.id}>
                  {e.weekday} · {e.period.code} · {e.subject.name} · {e.class.code}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[var(--muted)]">
              {periods.length} tiết cấu hình theo trường, không hard-code.
            </p>
          </section>
        )}
        {isStudent && (
          <section
            className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-5"
            data-widget="mentor-cta"
          >
            <h2 className="text-sm font-semibold">Mentor</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              IELTS 6.0 → 7.0, yếu Writing, tối thứ 3/5.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                className="rounded-full bg-[var(--pine)] px-4 py-2 text-sm text-white"
                href="/mentor"
              >
                Find mentor
              </Link>
              <Link
                className="rounded-full border border-[var(--line)] px-4 py-2 text-sm"
                href="/mentor/match-space"
              >
                Open Match Space
              </Link>
            </div>
          </section>
        )}
        {isTeacher && (
          <section
            className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-5"
            data-widget="pending-appointments"
          >
            <h2 className="text-sm font-semibold">Lịch hẹn chờ duyệt</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {appointments.map((a) => (
                <li key={a.id}>
                  {a.title} · {a.status}
                </li>
              ))}
              {appointments.length === 0 ? <li>Không có yêu cầu.</li> : null}
            </ul>
          </section>
        )}
        {isAdmin && (
          <section
            className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-5"
            data-widget="pending-approvals"
          >
            <h2 className="text-sm font-semibold">Phê duyệt đang chờ</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {approvals.map((a) => (
                <li key={a.id}>
                  {a.subjectType} · {a.status}
                </li>
              ))}
              {approvals.length === 0 ? (
                <li>Hàng đợi trống — kiểm tra yêu cầu phòng/CLB.</li>
              ) : null}
            </ul>
            <Link href="/admin/approvals" className="mt-3 inline-block text-sm underline">
              Mở Approvals
            </Link>
          </section>
        )}
        {isIt && (
          <section
            className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-5"
            data-widget="provisioning"
          >
            <h2 className="text-sm font-semibold">Cấp tài khoản</h2>
            <p className="mt-2 text-sm">Import Excel, đặt lại mật khẩu, gán vai trò.</p>
            <Link href="/admin/members" className="mt-3 inline-block text-sm underline">
              Members
            </Link>
          </section>
        )}
        <section
          className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-5"
          data-widget="events"
        >
          <h2 className="text-sm font-semibold">Sự kiện trường</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id}>{e.title}</li>
            ))}
          </ul>
        </section>
        <section
          className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-5"
          data-widget="notifications"
        >
          <h2 className="text-sm font-semibold">Thông báo gần đây</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {notifications.map((n) => (
              <li key={n.id}>{n.title}</li>
            ))}
            {notifications.length === 0 ? <li>Không có thông báo mới.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
