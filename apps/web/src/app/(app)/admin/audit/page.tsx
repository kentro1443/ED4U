import type { Metadata } from "next";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { loadUserDirectory } from "@/lib/userDirectory";
import { parseListParams, listSkip, type RawSearchParams } from "@/lib/listParams";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { ListToolbar, Pagination, type Facet } from "@/components/ui/ListToolbar";
import { Icons } from "@/components/ui/icons";
import { AuditRow } from "./AuditRow";

export const metadata: Metadata = { title: "Nhật ký hệ thống" };

const PER_PAGE = 25;

/**
 * The audit log is the surface a school's own compliance review opens first, so
 * it has to answer the questions an auditor actually asks: who did it, to what,
 * when in school-local time, and what changed. Every one of those facts was
 * already being recorded — only the timestamp, action and entity type were ever
 * displayed.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requireRoute("/admin/audit");
  const rawParams = await searchParams;
  const params = parseListParams(rawParams, {
    facets: ["action", "entity"],
    perPage: PER_PAGE,
  });

  const where: Prisma.AuditEventWhereInput = {
    tenantId: actor.tenantId,
    ...(params.filters.action ? { action: params.filters.action } : {}),
    ...(params.filters.entity ? { entityType: params.filters.entity } : {}),
    ...(params.q
      ? {
          OR: [
            { action: { contains: params.q, mode: "insensitive" } },
            { entityType: { contains: params.q, mode: "insensitive" } },
            { entityId: { contains: params.q, mode: "insensitive" } },
            { requestId: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [tenant, total, events, actionGroups, entityGroups] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: actor.tenantId },
      select: { timezone: true },
    }),
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: listSkip(params),
      take: params.perPage,
    }),
    db.auditEvent.groupBy({
      by: ["action"],
      where: { tenantId: actor.tenantId },
      _count: { action: true },
      orderBy: { action: "asc" },
    }),
    db.auditEvent.groupBy({
      by: ["entityType"],
      where: { tenantId: actor.tenantId },
      _count: { entityType: true },
      orderBy: { entityType: "asc" },
    }),
  ]);

  const directory = await loadUserDirectory(
    actor.tenantId,
    events.map((event) => event.actorId),
  );

  const facets: Facet[] = [
    {
      name: "action",
      label: "Hành động",
      options: actionGroups.map((group) => ({
        value: group.action,
        label: `${group.action} (${group._count.action})`,
      })),
    },
    {
      name: "entity",
      label: "Đối tượng",
      options: entityGroups.map((group) => ({
        value: group.entityType,
        label: `${group.entityType} (${group._count.entityType})`,
      })),
    },
  ];

  const exportHref = `/admin/audit/export${
    Object.keys(rawParams).length
      ? `?${new URLSearchParams(
          Object.entries(rawParams).flatMap(([key, value]) =>
            value === undefined ? [] : [[key, Array.isArray(value) ? (value[0] ?? "") : value]],
          ),
        ).toString()}`
      : ""
  }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhật ký hệ thống"
        description="Bản ghi bất biến của mọi thao tác thay đổi dữ liệu. Thời gian hiển thị theo múi giờ trường; giá trị UTC gốc nằm trong tooltip của mỗi dòng."
        badge={<Badge tone="dark">audit.read</Badge>}
        actions={
          <LinkButton href={exportHref} variant="secondary" size="sm">
            <Icons.download className="h-4 w-4" aria-hidden="true" />
            Xuất CSV
          </LinkButton>
        }
      />

      <ListToolbar
        basePath="/admin/audit"
        searchParams={rawParams}
        params={params}
        facets={facets}
        searchPlaceholder="Tìm theo hành động, đối tượng hoặc mã…"
        total={total}
        shown={events.length}
      />

      {events.length === 0 ? (
        <EmptyState
          title="Không có bản ghi nào khớp"
          description={
            total === 0
              ? "Nhật ký sẽ ghi lại mọi thao tác duyệt, tạo, sửa và xóa ngay khi người dùng thực hiện."
              : "Thử bỏ bớt bộ lọc hoặc tìm bằng từ khóa khác."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--canvas)]">
          <ul className="divide-y divide-[var(--hairline-soft)]">
            {events.map((event) => (
              <AuditRow
                key={event.id}
                event={{
                  id: event.id,
                  action: event.action,
                  entityType: event.entityType,
                  entityId: event.entityId,
                  requestId: event.requestId,
                  timestampIso: event.timestamp.toISOString(),
                  timestampLocal: new Intl.DateTimeFormat("vi-VN", {
                    timeZone: tenant.timezone,
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  }).format(event.timestamp),
                  actorLabel: event.actorId
                    ? (directory.get(event.actorId)?.fullName ?? "Tài khoản đã bị xóa")
                    : "Hệ thống",
                  actorCode: event.actorId
                    ? (directory.get(event.actorId)?.schoolMemberCode ?? null)
                    : null,
                  beforeJson: event.beforeJson ? JSON.stringify(event.beforeJson, null, 2) : null,
                  afterJson: event.afterJson ? JSON.stringify(event.afterJson, null, 2) : null,
                }}
              />
            ))}
          </ul>
        </div>
      )}

      <Pagination basePath="/admin/audit" searchParams={rawParams} params={params} total={total} />
    </div>
  );
}
