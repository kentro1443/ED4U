import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Icons } from "@/components/ui/icons";

interface MemberRow {
  id: string;
  schoolMemberCode: string;
  fullName: string;
  status: string;
  roles: string[];
}

export default async function MembersPage() {
  const actor = await requireRoute("/admin/members");
  const members = await db.schoolMembership.findMany({
    where: { tenantId: actor.tenantId },
    include: { user: { include: { roles: true } } },
    orderBy: { schoolMemberCode: "asc" },
    take: 50,
  });

  const data: MemberRow[] = members.map((m) => ({
    id: m.id,
    schoolMemberCode: m.schoolMemberCode,
    fullName: m.user.fullName,
    status: m.membershipStatus,
    roles: m.user.roles.map((r) => r.role),
  }));

  const columns: ColumnDef<MemberRow>[] = [
    {
      key: "code",
      header: "Mã thành viên",
      render: (row) => (
        <span className="font-mono text-xs font-semibold">{row.schoolMemberCode}</span>
      ),
    },
    {
      key: "name",
      header: "Họ và tên",
      render: (row) => <span className="font-medium text-[var(--ink)]">{row.fullName}</span>,
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "roles",
      header: "Vai trò",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles.map((r) => (
            <Badge key={r} tone={r.includes("ADMIN") ? "dark" : "neutral"} size="sm">
              {r}
            </Badge>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý thành viên"
        description="Mã thành viên (school_member_code) là tên đăng nhập duy nhất trong trường. ID nội bộ là UUID ngẫu nhiên."
        badge={<Badge tone="dark">ADMIN_IT</Badge>}
      />

      <Card variant="soft" className="border-dashed p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[var(--ink)] flex items-center gap-2">
              <Icons.applications className="h-4 w-4" />
              Nhập danh sách từ Excel (.xlsx)
            </p>
            <p className="text-xs text-[var(--muted)]">
              Cột yêu cầu: full_name, class, school_member_code, member_type
            </p>
          </div>
          <div>
            <label htmlFor="excel-file-input" className="sr-only">
              Chọn tệp Excel danh sách thành viên
            </label>
            <input
              id="excel-file-input"
              type="file"
              name="file"
              accept=".xlsx"
              aria-label="Chọn tệp Excel danh sách thành viên"
              className="text-xs text-[var(--muted)] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-[var(--hairline)] file:text-xs file:font-semibold file:bg-[var(--canvas)] hover:file:bg-[var(--surface-soft)] cursor-pointer"
            />
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
            Danh sách tài khoản ({members.length})
          </h2>
        </div>
        <DataTable data={data} columns={columns} emptyMessage="Chưa có thành viên nào." />
      </div>
    </div>
  );
}
