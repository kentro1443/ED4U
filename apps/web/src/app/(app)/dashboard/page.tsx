import Link from "next/link";
import { can } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Icons } from "@/components/ui/icons";

export default async function DashboardPage() {
  const actor = await requireActor();

  const isStudent = actor.roles.includes("STUDENT") && actor.membershipStatus === "ACTIVE";
  const isTeacher = actor.roles.includes("TEACHER");
  const isAdmin = can(actor, "approvals.resolve");
  const isIt = can(actor, "members.manage");

  // A student sees their own class's timetable; a teacher sees the periods they teach.
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
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan"
        description="Bảng điều khiển hoạt động theo vai trò · ED4U Demo High School"
        badge={<Badge tone="dark">{actor.roles.join(" · ")}</Badge>}
      />

      <div className="grid gap-5 md:grid-cols-2">
        {/* Timetable Widget */}
        {(isStudent || isTeacher) && (
          <Card data-widget="timetable">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <Icons.calendar className="h-4 w-4 text-[var(--muted)]" />
                <CardTitle>{isTeacher ? "Lịch dạy của bạn" : "Thời khóa biểu lớp"}</CardTitle>
              </div>
              <Badge size="sm">{periods.length} tiết / tuần</Badge>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">Chưa có tiết học nào được xếp.</p>
              ) : (
                <ul className="divide-y divide-[var(--hairline-soft)] text-xs md:text-sm">
                  {entries.slice(0, 6).map((e) => (
                    <li key={e.id} className="py-2 flex items-center justify-between">
                      <span className="font-medium text-[var(--ink)]">
                        {e.weekday} · {e.period.code} · {e.subject.name}
                      </span>
                      <span className="text-[var(--muted)] text-xs font-mono">{e.class.code}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {/* Mentor CTA Widget */}
        {isStudent && (
          <Card data-widget="mentor-cta">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <Icons.mentor className="h-4 w-4 text-[var(--muted)]" />
                <CardTitle>Mentor Intelligence</CardTitle>
              </div>
              <Badge tone="brand" size="sm">
                AI Matching
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs md:text-sm text-[var(--muted)] leading-relaxed">
                Đề xuất ghép nối mentor cá nhân hóa dựa trên mục tiêu, kỹ năng trọng tâm và khung
                giờ rảnh.
              </p>
              <div className="flex flex-wrap gap-2.5 pt-1">
                <LinkButton href="/mentor" variant="primary" size="sm">
                  Tìm Mentor
                </LinkButton>
                <LinkButton href="/mentor/match-space" variant="secondary" size="sm">
                  Mở Match Space
                </LinkButton>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Teacher Pending Appointments Widget */}
        {isTeacher && (
          <Card data-widget="pending-appointments">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <Icons.appointments className="h-4 w-4 text-[var(--muted)]" />
                <CardTitle>Lịch hẹn chờ phản hồi</CardTitle>
              </div>
              <Badge size="sm">{appointments.length}</Badge>
            </CardHeader>
            <CardContent>
              {appointments.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">Không có yêu cầu hẹn nào đang chờ.</p>
              ) : (
                <ul className="divide-y divide-[var(--hairline-soft)] text-xs md:text-sm">
                  {appointments.map((a) => (
                    <li key={a.id} className="py-2 flex items-center justify-between">
                      <span className="font-medium">{a.title}</span>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {/* Admin Approvals Widget */}
        {isAdmin && (
          <Card data-widget="pending-approvals">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <Icons.adminApprovals className="h-4 w-4 text-[var(--muted)]" />
                <CardTitle>Phê duyệt đang chờ</CardTitle>
              </div>
              <Badge tone={approvals.length > 0 ? "warning" : "neutral"} size="sm">
                {approvals.length} phiếu
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {approvals.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">
                  Hàng đợi trống — không có yêu cầu phòng/CLB chờ duyệt.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--hairline-soft)] text-xs md:text-sm">
                  {approvals.map((a) => (
                    <li key={a.id} className="py-2 flex items-center justify-between">
                      <span className="font-medium">{a.subjectType}</span>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/admin/approvals"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink)] hover:underline pt-1"
              >
                Mở trung tâm phê duyệt <Icons.arrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        )}

        {/* IT Admin Provisioning Widget */}
        {isIt && (
          <Card data-widget="provisioning">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <Icons.adminMembers className="h-4 w-4 text-[var(--muted)]" />
                <CardTitle>Quản trị tài khoản & Thành viên</CardTitle>
              </div>
              <Badge tone="dark" size="sm">
                ADMIN_IT
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs md:text-sm text-[var(--muted)]">
                Nhập danh sách học sinh/giáo viên từ Excel, cấp tài khoản, đặt lại mật khẩu tạm và
                phân quyền.
              </p>
              <Link
                href="/admin/members"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink)] hover:underline pt-1"
              >
                Quản lý thành viên <Icons.arrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        )}

        {/* School Events Widget */}
        <Card data-widget="events">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <Icons.events className="h-4 w-4 text-[var(--muted)]" />
              <CardTitle>Sự kiện trường</CardTitle>
            </div>
            <Badge size="sm">{events.length}</Badge>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">Chưa có sự kiện trường sắp tới.</p>
            ) : (
              <ul className="divide-y divide-[var(--hairline-soft)] text-xs md:text-sm">
                {events.map((e) => (
                  <li key={e.id} className="py-2 font-medium text-[var(--ink)]">
                    {e.title}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Notifications Widget */}
        <Card data-widget="notifications">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <Icons.notifications className="h-4 w-4 text-[var(--muted)]" />
              <CardTitle>Thông báo mới</CardTitle>
            </div>
            <Badge size="sm">{notifications.length}</Badge>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">Không có thông báo mới.</p>
            ) : (
              <ul className="divide-y divide-[var(--hairline-soft)] text-xs md:text-sm">
                {notifications.map((n) => (
                  <li key={n.id} className="py-2 text-[var(--body)]">
                    {n.title}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
