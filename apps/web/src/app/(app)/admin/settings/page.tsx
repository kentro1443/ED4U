import type { Metadata } from "next";
import { requireRoute } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatMinutes } from "@/lib/format";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Feedback";
import { OperationalHoursForm } from "./OperationalHoursForm";

export const metadata: Metadata = { title: "Cài đặt hệ thống" };

/** Falls back to the school day the seed uses, and says so rather than implying config. */
const DEFAULT_START_MINUTES = 7 * 60;
const DEFAULT_END_MINUTES = 20 * 60;

export default async function SettingsPage() {
  const actor = await requireRoute("/admin/settings");

  const [tenant, hours, counts] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: actor.tenantId },
      select: { name: true, slug: true, timezone: true, createdAt: true },
    }),
    db.operationalHours.findUnique({ where: { tenantId: actor.tenantId } }),
    Promise.all([
      db.schoolMembership.count({ where: { tenantId: actor.tenantId } }),
      db.room.count({ where: { tenantId: actor.tenantId } }),
      db.class.count({ where: { tenantId: actor.tenantId } }),
      db.academicPeriod.count({ where: { tenantId: actor.tenantId } }),
    ]),
  ]);

  const [memberCount, roomCount, classCount, periodCount] = counts;
  const startMinutes = hours?.startMinutes ?? DEFAULT_START_MINUTES;
  const endMinutes = hours?.endMinutes ?? DEFAULT_END_MINUTES;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cài đặt hệ thống"
        description="Cấu hình cấp trường do Quản trị hệ thống quản lý. Mọi thay đổi ở đây được ghi vào nhật ký hệ thống."
        badge={<Badge tone="dark">system.settings</Badge>}
      />

      <Card>
        <SectionHeader
          title="Khung giờ hoạt động"
          description="Giá trị này được Facility Engine dùng làm ràng buộc cứng khi xét một yêu cầu đặt phòng."
        />
        {!hours && (
          <Alert tone="warning" title="Chưa được cấu hình" className="mb-4">
            Trường chưa lưu khung giờ hoạt động. Hệ thống đang tạm dùng{" "}
            {formatMinutes(startMinutes)}–{formatMinutes(endMinutes)}. Hãy lưu giá trị chính thức để
            cấu hình trở thành nguồn sự thật.
          </Alert>
        )}
        <OperationalHoursForm
          startTime={formatMinutes(startMinutes)}
          endTime={formatMinutes(endMinutes)}
          timezone={tenant.timezone}
        />
      </Card>

      <Card>
        <SectionHeader
          title="Thông tin trường"
          description="Các giá trị nền tảng. Múi giờ là ranh giới chuyển đổi giữa thời điểm lưu trong CSDL và giờ dân dụng hiển thị, nên không thể đổi tại đây."
        />
        <dl className="divide-y divide-[var(--hairline-soft)]">
          <SettingRow label="Tên trường" value={tenant.name} />
          <SettingRow label="Định danh" value={tenant.slug} mono />
          <SettingRow
            label="Múi giờ"
            value={tenant.timezone}
            mono
            hint="Đổi múi giờ sẽ diễn giải lại toàn bộ thời khóa biểu và lịch đã lưu; thao tác này cần di trú dữ liệu có kiểm soát."
          />
          <SettingRow
            label="Khởi tạo"
            value={new Intl.DateTimeFormat("vi-VN", {
              timeZone: tenant.timezone,
              dateStyle: "long",
            }).format(tenant.createdAt)}
          />
        </dl>
      </Card>

      <Card>
        <SectionHeader
          title="Quy mô dữ liệu"
          description="Số liệu đọc trực tiếp từ cơ sở dữ liệu tại thời điểm tải trang."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Thành viên" value={memberCount} />
          <Metric label="Lớp" value={classCount} />
          <Metric label="Phòng" value={roomCount} />
          <Metric label="Tiết học" value={periodCount} />
        </div>
      </Card>
    </div>
  );
}

function SettingRow({
  label,
  value,
  mono,
  hint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <dt className="text-sm font-medium text-[var(--body)]">{label}</dt>
      <dd className="sm:max-w-md sm:text-right">
        <span className={`text-sm text-[var(--ink)] ${mono ? "font-mono" : ""}`}>{value}</span>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{hint}</p>}
      </dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-4">
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--ink)]">{value}</p>
    </div>
  );
}
