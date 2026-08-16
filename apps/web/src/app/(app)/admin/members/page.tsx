import type { Metadata } from "next";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { parseListParams, listSkip, type RawSearchParams } from "@/lib/listParams";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { ListToolbar, Pagination, type Facet } from "@/components/ui/ListToolbar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/DataTable";
import { CreateMemberButton, MemberRowActions, RosterImportCard } from "./MemberControls";

export const metadata: Metadata = { title: "Quản lý thành viên" };

const PER_PAGE = 25;

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requireRoute("/admin/members");
  const rawParams = await searchParams;
  const params = parseListParams(rawParams, {
    facets: ["status", "type"],
    perPage: PER_PAGE,
  });

  const where: Prisma.SchoolMembershipWhereInput = {
    tenantId: actor.tenantId,
    ...(params.filters.status
      ? {
          membershipStatus: params.filters.status as
            "ACTIVE" | "GRADUATED" | "LEFT_SCHOOL" | "SUSPENDED",
        }
      : {}),
    ...(params.filters.type
      ? { memberType: params.filters.type as "STUDENT" | "TEACHER" | "STAFF" }
      : {}),
    ...(params.q
      ? {
          OR: [
            { schoolMemberCode: { contains: params.q, mode: "insensitive" } },
            { user: { fullName: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [total, members, classes, statusCounts] = await Promise.all([
    db.schoolMembership.count({ where }),
    db.schoolMembership.findMany({
      where,
      include: {
        user: { include: { roles: true } },
        class: { select: { code: true, name: true } },
      },
      orderBy: { schoolMemberCode: "asc" },
      skip: listSkip(params),
      take: params.perPage,
    }),
    db.class.findMany({
      where: { tenantId: actor.tenantId },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    db.schoolMembership.groupBy({
      by: ["membershipStatus"],
      where: { tenantId: actor.tenantId },
      _count: { membershipStatus: true },
    }),
  ]);

  const facets: Facet[] = [
    {
      name: "status",
      label: "Trạng thái",
      options: [
        { value: "ACTIVE", label: "Đang hoạt động" },
        { value: "GRADUATED", label: "Đã tốt nghiệp" },
        { value: "SUSPENDED", label: "Tạm ngưng" },
        { value: "LEFT_SCHOOL", label: "Đã rời trường" },
      ].map((option) => {
        const count =
          statusCounts.find((row) => row.membershipStatus === option.value)?._count
            .membershipStatus ?? 0;
        return { value: option.value, label: `${option.label} (${count})` };
      }),
    },
    {
      name: "type",
      label: "Loại",
      options: [
        { value: "STUDENT", label: "Học sinh" },
        { value: "TEACHER", label: "Giáo viên" },
        { value: "STAFF", label: "Nhân viên" },
      ],
    },
  ];

  const classOptions = classes.map((klass) => ({
    id: klass.id,
    label: `${klass.code} · ${klass.name}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý thành viên"
        description="Mã thành viên (school_member_code) là tên đăng nhập duy nhất trong trường và không thể thay đổi. ID nội bộ là UUID ngẫu nhiên và không bao giờ hiển thị cho người dùng."
        badge={<Badge tone="dark">ADMIN_IT</Badge>}
        actions={<CreateMemberButton classes={classOptions} />}
      />

      <RosterImportCard classCount={classes.length} />

      <Card className="space-y-4 p-4 md:p-5">
        <ListToolbar
          basePath="/admin/members"
          searchParams={rawParams}
          params={params}
          facets={facets}
          searchPlaceholder="Tìm theo tên hoặc mã thành viên…"
          total={total}
          shown={members.length}
        />

        {members.length === 0 ? (
          <EmptyState
            title="Không có thành viên nào khớp"
            description={
              total === 0
                ? "Tạo tài khoản đầu tiên hoặc nhập danh sách từ tệp CSV."
                : "Thử bỏ bớt bộ lọc hoặc tìm bằng từ khóa khác."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã thành viên</TableHead>
                <TableHead>Họ và tên</TableHead>
                <TableHead className="hidden md:table-cell">Lớp</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="hidden lg:table-cell">Vai trò</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-mono text-xs font-semibold">
                    {member.schoolMemberCode}
                  </TableCell>
                  <TableCell className="font-medium">{member.user.fullName}</TableCell>
                  <TableCell className="hidden text-xs text-[var(--muted)] md:table-cell">
                    {member.class ? `${member.class.code}` : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={member.membershipStatus} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {member.user.roles.map((role) => (
                        <Badge
                          key={role.role}
                          tone={role.role.includes("ADMIN") ? "dark" : "neutral"}
                          size="sm"
                        >
                          {role.role}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <MemberRowActions
                      membershipId={member.id}
                      fullName={member.user.fullName}
                      schoolMemberCode={member.schoolMemberCode}
                      status={member.membershipStatus}
                      isSelf={member.userId === actor.userId}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Pagination
          basePath="/admin/members"
          searchParams={rawParams}
          params={params}
          total={total}
        />
      </Card>
    </div>
  );
}
