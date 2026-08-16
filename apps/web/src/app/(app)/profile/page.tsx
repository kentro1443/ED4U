import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { formatDate } from "@/lib/format";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/DataDisplay";
import { Icons } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Hồ sơ" };

export default async function ProfilePage() {
  const actor = await requireActor();

  const [tenant, user, membership, activity] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: actor.tenantId },
      select: { name: true, timezone: true },
    }),
    db.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { fullName: true, dateOfBirth: true, gender: true, createdAt: true, roles: true },
    }),
    db.schoolMembership.findFirst({
      where: { userId: actor.userId, tenantId: actor.tenantId },
      include: { class: { select: { code: true, name: true, grade: true } } },
    }),
    Promise.all([
      db.clubMembership.count({ where: { userId: actor.userId } }),
      db.application.count({ where: { tenantId: actor.tenantId, studentId: actor.userId } }),
      db.appointment.count({ where: { tenantId: actor.tenantId, studentId: actor.userId } }),
    ]),
  ]);

  const [clubCount, applicationCount, appointmentCount] = activity;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hồ sơ"
        description="Thông tin định danh trong trường. Mã thành viên và ngày sinh do nhà trường quản lý; liên hệ ADMIN_IT nếu cần đính chính."
      />

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={user.fullName} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--ink)]">
              {user.fullName}
            </h2>
            <p className="font-mono text-sm text-[var(--muted)]">{actor.schoolMemberCode}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge status={actor.membershipStatus} />
              {actor.roles.map((role) => (
                <Badge key={role} tone={role.includes("ADMIN") ? "dark" : "neutral"} size="sm">
                  {role}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeader title="Thông tin trường" />
          <dl className="divide-y divide-[var(--hairline-soft)]">
            <Row label="Trường" value={tenant.name} />
            <Row label="Loại thành viên" value={memberTypeLabel(actor.memberType)} />
            <Row
              label="Lớp"
              value={
                membership?.class
                  ? `${membership.class.code} · ${membership.class.name}`
                  : "Không thuộc lớp nào"
              }
            />
            <Row label="Khối" value={membership?.class?.grade ?? "—"} />
            <Row
              label="Bắt đầu"
              value={
                membership ? formatDate(membership.startedAt, tenant.timezone) : "Không xác định"
              }
            />
            {membership?.endedAt && (
              <Row label="Kết thúc" value={formatDate(membership.endedAt, tenant.timezone)} />
            )}
          </dl>
        </Card>

        <Card>
          <SectionHeader
            title="Thông tin cá nhân"
            description="Ngày sinh là dữ liệu dân sự, được lưu dưới dạng ngày lịch nên không thay đổi theo múi giờ."
          />
          <dl className="divide-y divide-[var(--hairline-soft)]">
            <Row label="Họ và tên" value={user.fullName} />
            <Row
              label="Ngày sinh"
              value={
                user.dateOfBirth
                  ? new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC", dateStyle: "long" }).format(
                      user.dateOfBirth,
                    )
                  : "Chưa ghi nhận"
              }
            />
            <Row
              label="Giới tính"
              value={user.gender ? genderLabel(user.gender) : "Chưa ghi nhận"}
            />
            <Row label="Múi giờ hiển thị" value={tenant.timezone} mono />
          </dl>
        </Card>
      </div>

      <Card>
        <SectionHeader
          title="Hoạt động của bạn"
          description="Số liệu đọc trực tiếp từ dữ liệu của tài khoản này."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <ActivityTile
            label="Câu lạc bộ"
            value={clubCount}
            href="/clubs"
            icon={<Icons.clubs className="h-4 w-4" aria-hidden="true" />}
          />
          <ActivityTile
            label="Đơn từ đã gửi"
            value={applicationCount}
            href="/applications"
            icon={<Icons.applications className="h-4 w-4" aria-hidden="true" />}
          />
          <ActivityTile
            label="Lịch hẹn"
            value={appointmentCount}
            href="/appointments"
            icon={<Icons.appointments className="h-4 w-4" aria-hidden="true" />}
          />
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <dt className="shrink-0 text-sm text-[var(--muted)]">{label}</dt>
      <dd className={`text-right text-sm text-[var(--ink)] ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function ActivityTile({
  label,
  value,
  href,
  icon,
}: {
  label: string;
  value: number;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] p-4 transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
    >
      <p className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
        {icon}
        {label}
      </p>
      <p className="mt-1 flex items-center justify-between text-2xl font-semibold tabular-nums text-[var(--ink)]">
        {value}
        <Icons.arrowRight
          className="h-4 w-4 text-[var(--muted)] transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </p>
    </Link>
  );
}

function memberTypeLabel(type: string): string {
  return { STUDENT: "Học sinh", TEACHER: "Giáo viên", STAFF: "Nhân viên" }[type] ?? type;
}

function genderLabel(gender: string): string {
  return (
    { MALE: "Nam", FEMALE: "Nữ", OTHER: "Khác", UNDISCLOSED: "Không tiết lộ" }[gender] ?? gender
  );
}
