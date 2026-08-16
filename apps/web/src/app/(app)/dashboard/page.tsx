import type { Metadata } from "next";
import type { Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { can } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { formatAge, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Icons, type IconType } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Tổng quan" };

const WEEKDAY_LABELS: Record<string, string> = {
  MON: "Thứ Hai",
  TUE: "Thứ Ba",
  WED: "Thứ Tư",
  THU: "Thứ Năm",
  FRI: "Thứ Sáu",
};

const ROLE_LABELS: Record<string, string> = {
  STUDENT: "Học sinh",
  TEACHER: "Giáo viên",
  MENTOR: "Cố vấn",
  SCHOOL_ADMIN: "Quản trị trường",
  ADMIN_IT: "Quản trị hệ thống",
};

/**
 * Which applications count as "waiting on me": the ones assigned to a teacher,
 * or the ones a student submitted.
 */
function applicationScope(
  tenantId: string,
  userId: string,
  isTeacher: boolean,
): Prisma.ApplicationWhereInput {
  return {
    tenantId,
    status: { in: ["SUBMITTED", "IN_REVIEW"] },
    ...(isTeacher ? { currentTeacherId: userId } : { studentId: userId }),
  };
}

/** School-local weekday code, so "hôm nay" means the school's today, not the server's. */
function schoolWeekday(now: Date, timeZone: string): string {
  const short = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  return short.slice(0, 3).toUpperCase();
}

export default async function DashboardPage() {
  const actor = await requireActor();
  const now = new Date();

  const isStudent = actor.roles.includes("STUDENT") && actor.membershipStatus === "ACTIVE";
  const isTeacher = actor.roles.includes("TEACHER");
  const isAdmin = can(actor, "approvals.resolve");
  const isIt = can(actor, "members.manage");

  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: actor.tenantId },
    select: { name: true, timezone: true },
  });
  const today = schoolWeekday(now, tenant.timezone);

  // A student sees their own class's timetable; a teacher sees the periods they teach.
  const timetableScope = isTeacher
    ? { tenantId: actor.tenantId, teacherId: actor.userId }
    : actor.classId
      ? { tenantId: actor.tenantId, classId: actor.classId }
      : null;

  const [
    entries,
    pendingRoomRequests,
    pendingApprovals,
    appointments,
    events,
    unreadNotifications,
    unreadCount,
    memberCount,
    pendingApplications,
  ] = await Promise.all([
    timetableScope
      ? db.timetableEntry.findMany({
          where: timetableScope,
          include: { subject: true, period: true, class: true, room: true },
          orderBy: [{ weekday: "asc" }, { period: { sortOrder: "asc" } }],
        })
      : Promise.resolve([]),
    isAdmin
      ? db.roomRequest.findMany({
          where: { tenantId: actor.tenantId, status: "PENDING_APPROVAL" },
          include: { room: { select: { code: true, name: true } } },
          orderBy: { holdCreatedAt: "asc" },
          take: 5,
        })
      : Promise.resolve([]),
    isAdmin
      ? db.approval.count({ where: { tenantId: actor.tenantId, status: "PENDING" } })
      : Promise.resolve(0),
    db.appointment.findMany({
      where: {
        tenantId: actor.tenantId,
        OR: [{ studentId: actor.userId }, { teacherId: actor.userId }],
        startAt: { gte: now },
      },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
    // Upcoming only, and ordered: a dashboard that lists last term's events as
    // "sự kiện trường" is worse than an empty card.
    db.schoolEvent.findMany({
      where: { tenantId: actor.tenantId, endAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
    db.notification.findMany({
      where: { tenantId: actor.tenantId, userId: actor.userId, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.notification.count({
      where: { tenantId: actor.tenantId, userId: actor.userId, readAt: null },
    }),
    isIt
      ? db.schoolMembership.count({
          where: { tenantId: actor.tenantId, membershipStatus: "ACTIVE" },
        })
      : Promise.resolve(0),
    db.application.count({
      // Written as a typed variable rather than a conditional spread: a spread
      // widens the object and lets a misspelled column through typecheck, which
      // is how `assignedTeacherId` reached the browser as a runtime failure.
      where: applicationScope(actor.tenantId, actor.userId, isTeacher),
    }),
  ]);

  const todayEntries = entries.filter((entry) => entry.weekday === today);
  const schoolDateLabel = new Intl.DateTimeFormat("vi-VN", {
    timeZone: tenant.timezone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);
  const overdueRequests = pendingRoomRequests.filter(
    (request) => now.getTime() - request.holdCreatedAt.getTime() >= 24 * 3_600_000,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan"
        description={`Bảng điều khiển hoạt động theo vai trò · ${tenant.name}`}
        badge={
          <Badge tone="brand">
            {actor.roles.map((role) => ROLE_LABELS[role] ?? role).join(" · ")}
          </Badge>
        }
      />

      {isTeacher && (
        <section className="grid overflow-hidden rounded-[28px] bg-[var(--surface-dark)] text-white shadow-[var(--shadow-lg)] lg:grid-cols-[1.2fr_.8fr]">
          <div className="p-6 sm:p-8">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue-300">
              Không gian giáo viên · {schoolDateLabel}
            </p>
            <h2 className="mt-4 max-w-2xl text-balance text-2xl font-extrabold tracking-[-0.04em] text-white sm:text-3xl">
              Ưu tiên giảng dạy và hỗ trợ học sinh trong một nhịp làm việc.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Hôm nay có {todayEntries.length} tiết dạy, {pendingApplications} đơn cần xử lý và{" "}
              {appointments.length} lịch hẹn sắp tới. Các số liệu được lấy trực tiếp theo phạm vi
              phụ trách của bạn.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <LinkButton href="/calendar" variant="secondary" size="sm">
                <Icons.calendar className="h-3.5 w-3.5" />
                Mở lịch dạy
              </LinkButton>
              <LinkButton href="/applications" variant="secondary" size="sm">
                <Icons.applications className="h-3.5 w-3.5" />
                Xử lý đơn
              </LinkButton>
              <LinkButton href="/appointments" variant="secondary" size="sm">
                <Icons.appointments className="h-3.5 w-3.5" />
                Quản lý lịch hẹn
              </LinkButton>
            </div>
          </div>

          <div className="m-3 rounded-[22px] border border-white/10 bg-white/[0.06] p-5 sm:m-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold text-white">Lịch dạy hôm nay</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {WEEKDAY_LABELS[today] ?? "Cuối tuần"}
                </p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-200 ring-1 ring-inset ring-blue-300/20">
                <Icons.calendar className="h-4 w-4" />
              </span>
            </div>
            {todayEntries.length === 0 ? (
              <p className="mt-5 rounded-2xl bg-white/[0.05] p-4 text-xs leading-5 text-slate-300 ring-1 ring-inset ring-white/10">
                Không có tiết dạy nào được xếp cho hôm nay.
              </p>
            ) : (
              <ol className="mt-4 space-y-2">
                {todayEntries.slice(0, 3).map((entry) => (
                  <li
                    key={entry.id}
                    className="grid grid-cols-[3.25rem_1fr] gap-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-inset ring-white/10"
                  >
                    <span className="text-xs font-extrabold tabular-nums text-blue-300">
                      {entry.period.startTime}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-white">
                        {entry.subject.name} · {entry.class.code}
                      </span>
                      <span className="mt-1 block text-[10px] text-slate-400">
                        Phòng {entry.room.code}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {todayEntries.length > 3 && (
              <p className="mt-3 text-[10px] font-semibold text-blue-200">
                +{todayEntries.length - 3} tiết khác trong lịch đầy đủ
              </p>
            )}
          </div>
        </section>
      )}

      {/* Summary strip: what needs attention, before any detail. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(isStudent || isTeacher) && (
          <Stat
            label={isTeacher ? "Tiết dạy hôm nay" : "Tiết học hôm nay"}
            value={todayEntries.length}
            hint={WEEKDAY_LABELS[today] ?? "Cuối tuần"}
            icon="calendar"
            href="/calendar"
          />
        )}
        {isAdmin && (
          <Stat
            label="Yêu cầu phòng chờ duyệt"
            value={pendingRoomRequests.length + pendingApprovals}
            hint={overdueRequests > 0 ? `${overdueRequests} phiếu quá 24 giờ` : "Không tồn đọng"}
            tone={overdueRequests > 0 ? "warning" : "neutral"}
            icon="adminApprovals"
            href="/admin/approvals"
          />
        )}
        {isIt && (
          <Stat
            label="Thành viên đang hoạt động"
            value={memberCount}
            hint="Toàn trường"
            icon="adminMembers"
            href="/admin/members"
          />
        )}
        <Stat
          label={isTeacher ? "Đơn cần xử lý" : "Đơn đang chờ"}
          value={pendingApplications}
          hint={isTeacher ? "Được phân công cho bạn" : "Bạn đã gửi"}
          icon="applications"
          href="/applications"
        />
        <Stat
          label="Thông báo chưa đọc"
          value={unreadCount}
          hint={unreadCount > 0 ? "Cần xem" : "Đã đọc hết"}
          tone={unreadCount > 0 ? "warning" : "neutral"}
          icon="notifications"
          href="/notifications"
        />
        <Stat
          label="Lịch hẹn sắp tới"
          value={appointments.length}
          hint="5 mục gần nhất"
          icon="appointments"
          href="/appointments"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {(isStudent || isTeacher) && (
          <Widget
            title={isTeacher ? "Lịch dạy hôm nay" : "Thời khóa biểu hôm nay"}
            icon="calendar"
            badge={
              <Badge size="sm" tone="neutral">
                {WEEKDAY_LABELS[today] ?? "Cuối tuần"}
              </Badge>
            }
            href="/calendar"
            linkLabel="Mở lịch đầy đủ"
            testId="timetable"
          >
            {todayEntries.length === 0 ? (
              <Empty>
                {WEEKDAY_LABELS[today]
                  ? "Hôm nay không có tiết nào được xếp."
                  : "Hôm nay là cuối tuần — không có tiết học."}
              </Empty>
            ) : (
              <ul className="divide-y divide-[var(--hairline-soft)] text-sm">
                {todayEntries.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-[var(--muted)]">
                        {entry.period.startTime}
                      </span>
                      <span className="ml-2 font-medium text-[var(--ink)]">
                        {entry.subject.name}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-[var(--muted)]">
                      {entry.class.code} · {entry.room.code}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Widget>
        )}

        {isStudent && (
          <Widget
            title="Mentor Intelligence"
            icon="mentor"
            badge={
              <Badge tone="brand" size="sm">
                Ghép nối theo mục tiêu
              </Badge>
            }
            testId="mentor-cta"
          >
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              Mô tả mục tiêu bằng ngôn ngữ tự nhiên; hệ thống trích xuất ràng buộc, bạn xác nhận,
              rồi engine xếp hạng mentor phù hợp. Điểm ghép nối là điểm xếp hạng, không phải xác
              suất thành công.
            </p>
            <div className="flex flex-wrap gap-2 pt-3">
              <LinkButton href="/mentor" variant="primary" size="sm">
                Tìm Mentor
              </LinkButton>
              <LinkButton href="/mentor/match-space" variant="secondary" size="sm">
                Mở Match Space
              </LinkButton>
            </div>
          </Widget>
        )}

        {isAdmin && (
          <Widget
            title="Yêu cầu phòng chờ duyệt"
            icon="adminApprovals"
            badge={
              <Badge tone={pendingRoomRequests.length > 0 ? "warning" : "neutral"} size="sm">
                {pendingRoomRequests.length} phiếu
              </Badge>
            }
            href="/admin/approvals"
            linkLabel="Mở trung tâm phê duyệt"
            testId="pending-approvals"
          >
            {pendingRoomRequests.length === 0 ? (
              <Empty>Hàng đợi trống — không có yêu cầu phòng chờ duyệt.</Empty>
            ) : (
              <ul className="divide-y divide-[var(--hairline-soft)] text-sm">
                {pendingRoomRequests.map((request) => (
                  <li key={request.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate font-medium text-[var(--ink)]">
                      {request.room.code} · {request.room.name}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--muted)]">
                      chờ {formatAge(request.holdCreatedAt, now)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Widget>
        )}

        {isIt && (
          <Widget
            title="Quản trị tài khoản"
            icon="adminMembers"
            badge={
              <Badge tone="dark" size="sm">
                ADMIN_IT
              </Badge>
            }
            href="/admin/members"
            linkLabel="Quản lý thành viên"
            testId="provisioning"
          >
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              Cấp tài khoản, nhập danh sách từ tệp CSV theo giao dịch toàn-hoặc-không, đặt lại mật
              khẩu tạm thời và thu hồi phiên đăng nhập.
            </p>
          </Widget>
        )}

        {isTeacher && (
          <Widget
            title="Lịch hẹn sắp tới"
            icon="appointments"
            badge={<Badge size="sm">{appointments.length}</Badge>}
            href="/appointments"
            linkLabel="Mở lịch hẹn"
            testId="pending-appointments"
          >
            {appointments.length === 0 ? (
              <Empty>Không có lịch hẹn nào sắp tới.</Empty>
            ) : (
              <ul className="divide-y divide-[var(--hairline-soft)] text-sm">
                {appointments.map((appointment) => (
                  <li key={appointment.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate font-medium">{appointment.title}</span>
                    <StatusBadge status={appointment.status} />
                  </li>
                ))}
              </ul>
            )}
          </Widget>
        )}

        <Widget
          title="Sự kiện trường sắp tới"
          icon="events"
          badge={<Badge size="sm">{events.length}</Badge>}
          href="/events"
          linkLabel="Xem tất cả sự kiện"
          testId="events"
        >
          {events.length === 0 ? (
            <Empty>Chưa có sự kiện trường nào sắp diễn ra.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--hairline-soft)] text-sm">
              {events.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate font-medium text-[var(--ink)]">
                    {event.title}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">
                    {formatDateTime(event.startAt, tenant.timezone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget
          title="Thông báo chưa đọc"
          icon="notifications"
          badge={
            <Badge tone={unreadCount > 0 ? "danger" : "neutral"} size="sm">
              {unreadCount}
            </Badge>
          }
          href="/notifications"
          linkLabel="Mở hộp thư"
          testId="notifications"
        >
          {unreadNotifications.length === 0 ? (
            <Empty>Không có thông báo chưa đọc.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--hairline-soft)] text-sm">
              {unreadNotifications.map((notification) => (
                <li key={notification.id} className="py-2">
                  <p className="truncate font-medium text-[var(--ink)]">{notification.title}</p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {formatAge(notification.createdAt, now)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Widget>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
  href,
  tone = "neutral",
}: {
  label: string;
  value: number;
  hint: string;
  icon: IconType;
  href: string;
  tone?: "neutral" | "warning";
}) {
  const IconComponent = Icons[icon];
  return (
    <Link
      href={href}
      className={`group rounded-2xl border p-4 shadow-[var(--shadow-sm)] transition-[border-color,background-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-600)] ${
        tone === "warning"
          ? "border-amber-200 bg-amber-50/70 hover:bg-amber-50 hover:shadow-[var(--shadow-md)]"
          : "border-[var(--hairline)] bg-[var(--surface-card)] hover:border-[var(--brand-100)] hover:bg-[var(--brand-50)]/45 hover:shadow-[var(--shadow-md)]"
      }`}
    >
      <p className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand-50)] text-[var(--primary)] ring-1 ring-inset ring-[var(--brand-100)]">
          <IconComponent className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="truncate">{label}</span>
      </p>
      <p
        className={`mt-2 text-2xl font-extrabold tabular-nums tracking-[-0.04em] ${
          tone === "warning" ? "text-amber-800" : "text-[var(--ink)]"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{hint}</p>
    </Link>
  );
}

function Widget({
  title,
  icon,
  badge,
  href,
  linkLabel,
  testId,
  children,
}: {
  title: string;
  icon: IconType;
  badge?: React.ReactNode;
  href?: string;
  linkLabel?: string;
  testId: string;
  children: React.ReactNode;
}) {
  const IconComponent = Icons[icon];
  return (
    <Card data-widget={testId} className="flex flex-col rounded-[24px]">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-50)] text-[var(--primary)] ring-1 ring-inset ring-[var(--brand-100)]">
            <IconComponent className="h-4 w-4" aria-hidden="true" />
          </span>
          <CardTitle>{title}</CardTitle>
        </div>
        {badge}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
      {href && linkLabel && (
        <Link
          href={href}
          className="mt-5 inline-flex items-center gap-1.5 self-start rounded-xl bg-[var(--brand-50)] px-3 py-2 text-xs font-bold text-[var(--primary)] transition-colors hover:bg-[var(--brand-100)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-600)]"
        >
          {linkLabel}
          <Icons.arrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      )}
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--muted)]">{children}</p>;
}
