import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { formatAge, formatDateTime } from "@/lib/format";
import { parseListParams, listSkip, type RawSearchParams } from "@/lib/listParams";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { ListToolbar, Pagination, type Facet } from "@/components/ui/ListToolbar";
import { Icons } from "@/components/ui/icons";
import { MarkAllReadButton, MarkReadButton } from "./NotificationControls";

export const metadata: Metadata = { title: "Thông báo" };

const PER_PAGE = 25;

/**
 * Where a notification points.
 *
 * `entityType`/`entityId` were already stored and never used, so a notification
 * told a user something happened and then stranded them. Unknown types resolve
 * to no link rather than to a guessed route: a dead link is worse than none.
 */
function destinationFor(entityType: string | null, entityId: string | null): string | null {
  if (!entityType) return null;
  switch (entityType) {
    case "RoomRequest":
      return "/rooms";
    case "Application":
      return "/applications";
    case "Appointment":
      return "/appointments";
    case "MentorBooking":
      return "/mentor";
    case "SchoolEvent":
      return "/events";
    case "Club":
      return entityId ? `/clubs/${entityId}` : "/clubs";
    case "Thread":
      return entityId ? `/discussion/threads/${entityId}` : "/discussion";
    default:
      return null;
  }
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requireActor();
  const rawParams = await searchParams;
  const params = parseListParams(rawParams, { facets: ["state"], perPage: PER_PAGE });
  const now = new Date();

  const stateFilter = params.filters.state;
  const where: Prisma.NotificationWhereInput = {
    userId: actor.userId,
    tenantId: actor.tenantId,
    ...(stateFilter === "UNREAD" ? { readAt: null } : {}),
    ...(stateFilter === "READ" ? { readAt: { not: null } } : {}),
    ...(params.q
      ? {
          OR: [
            { title: { contains: params.q, mode: "insensitive" } },
            { body: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [tenant, total, unreadCount, items] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: actor.tenantId },
      select: { timezone: true },
    }),
    db.notification.count({ where }),
    db.notification.count({
      where: { userId: actor.userId, tenantId: actor.tenantId, readAt: null },
    }),
    db.notification.findMany({
      where,
      orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
      skip: listSkip(params),
      take: params.perPage,
    }),
  ]);

  const facets: Facet[] = [
    {
      name: "state",
      label: "Trạng thái",
      options: [
        { value: "UNREAD", label: `Chưa đọc (${unreadCount})` },
        { value: "READ", label: "Đã đọc" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Thông báo"
        description="Kết quả duyệt phòng, đơn từ, lịch hẹn, mentor và diễn đàn liên quan tới bạn."
        badge={unreadCount > 0 ? <Badge tone="danger">{unreadCount} chưa đọc</Badge> : undefined}
        actions={<MarkAllReadButton unreadCount={unreadCount} />}
      />

      <Card className="space-y-4 p-4 md:p-5">
        <ListToolbar
          basePath="/notifications"
          searchParams={rawParams}
          params={params}
          facets={facets}
          searchPlaceholder="Tìm trong thông báo…"
          total={total}
          shown={items.length}
        />

        {items.length === 0 ? (
          <EmptyState
            title={total === 0 ? "Hộp thư trống" : "Không có thông báo nào khớp"}
            description={
              total === 0
                ? "Thông báo sẽ hiện khi có kết quả duyệt đơn, phòng, mentor hoặc diễn đàn liên quan tới bạn."
                : "Thử bỏ bớt bộ lọc hoặc tìm bằng từ khóa khác."
            }
            icon={<Icons.notifications className="h-6 w-6" />}
          />
        ) : (
          <ul className="divide-y divide-[var(--hairline-soft)]">
            {items.map((notification) => {
              const unread = notification.readAt === null;
              const href = destinationFor(notification.entityType, notification.entityId);
              const body = (
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
                    {unread && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--error)]"
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{notification.title}</span>
                    {unread && <span className="sr-only">(chưa đọc)</span>}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-[var(--body)]">
                    {notification.body}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    <time
                      dateTime={notification.createdAt.toISOString()}
                      title={formatDateTime(notification.createdAt, tenant.timezone)}
                    >
                      {formatAge(notification.createdAt, now)}
                    </time>
                    {notification.entityType && ` · ${notification.entityType}`}
                  </p>
                </div>
              );

              return (
                <li
                  key={notification.id}
                  className={`flex items-start gap-3 py-3 ${unread ? "" : "opacity-70"}`}
                >
                  {href ? (
                    <Link
                      href={href}
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-md transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ink)]"
                    >
                      {body}
                      <Icons.arrowRight
                        className="mt-1 h-4 w-4 shrink-0 text-[var(--muted)]"
                        aria-hidden="true"
                      />
                    </Link>
                  ) : (
                    body
                  )}
                  {unread && <MarkReadButton notificationId={notification.id} />}
                </li>
              );
            })}
          </ul>
        )}

        <Pagination
          basePath="/notifications"
          searchParams={rawParams}
          params={params}
          total={total}
        />
      </Card>
    </div>
  );
}
