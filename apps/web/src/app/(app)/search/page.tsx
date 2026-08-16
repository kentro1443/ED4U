import type { Metadata } from "next";
import Link from "next/link";
import { can, canReadDiscussion } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { formatDate } from "@/lib/format";
import { type RawSearchParams } from "@/lib/listParams";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { Icons } from "@/components/ui/icons";
import { SearchForm } from "./SearchForm";

export const metadata: Metadata = { title: "Tìm kiếm" };

const PER_KIND = 6;

interface Hit {
  kind: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * Cross-entity search.
 *
 * Results are assembled per entity and each query is scoped by the permission
 * that governs that entity, so search can never become a side channel around
 * authorization: a student searching "10A1" sees rooms and clubs, never the
 * member directory.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requireActor();
  const raw = await searchParams;
  const q = (Array.isArray(raw.q) ? raw.q[0] : (raw.q ?? "")).trim().slice(0, 120);

  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: actor.tenantId },
    select: { timezone: true },
  });

  const groups: Array<{ label: string; icon: keyof typeof Icons; hits: Hit[] }> = [];

  if (q.length >= 2) {
    const contains = { contains: q, mode: "insensitive" as const };

    const [rooms, clubs, events, classes] = await Promise.all([
      db.room.findMany({
        where: { tenantId: actor.tenantId, OR: [{ code: contains }, { name: contains }] },
        include: { roomType: { select: { name: true } } },
        take: PER_KIND,
        orderBy: { code: "asc" },
      }),
      db.club.findMany({
        where: { tenantId: actor.tenantId, name: contains },
        take: PER_KIND,
        orderBy: { name: "asc" },
      }),
      db.schoolEvent.findMany({
        where: { tenantId: actor.tenantId, title: contains },
        take: PER_KIND,
        orderBy: { startAt: "desc" },
      }),
      db.class.findMany({
        where: { tenantId: actor.tenantId, OR: [{ code: contains }, { name: contains }] },
        take: PER_KIND,
        orderBy: { code: "asc" },
      }),
    ]);

    if (rooms.length > 0) {
      groups.push({
        label: "Phòng",
        icon: "rooms",
        hits: rooms.map((room) => ({
          kind: "Phòng",
          title: `${room.code} · ${room.name}`,
          subtitle: `${room.roomType.name} · ${room.capacity} chỗ · ${room.building}, tầng ${room.floor}`,
          href: "/rooms/schedule",
        })),
      });
    }

    if (clubs.length > 0) {
      groups.push({
        label: "Câu lạc bộ",
        icon: "clubs",
        hits: clubs.map((club) => ({
          kind: "CLB",
          title: club.name,
          subtitle: club.description ?? "Câu lạc bộ của trường",
          href: `/clubs/${club.id}`,
        })),
      });
    }

    if (events.length > 0) {
      groups.push({
        label: "Sự kiện trường",
        icon: "events",
        hits: events.map((event) => ({
          kind: "Sự kiện",
          title: event.title,
          subtitle: `${formatDate(event.startAt, tenant.timezone)} · phạm vi ${event.visibility}`,
          href: "/events",
        })),
      });
    }

    if (classes.length > 0) {
      groups.push({
        label: "Lớp",
        icon: "adminMembers",
        hits: classes.map((klass) => ({
          kind: "Lớp",
          title: `${klass.code} · ${klass.name}`,
          subtitle: `Khối ${klass.grade}`,
          href: "/calendar",
        })),
      });
    }

    // Discussion is gated by the same predicate the navigation uses: alumni
    // mentors hold `discussion.read` for their own space but must not reach the
    // general forum, and search must not become the way around that.
    if (can(actor, "discussion.read") && canReadDiscussion(actor)) {
      // A thread carries no tenant column of its own; it is reached through
      // forum → category → tenant, so the scope is asserted along that path
      // rather than assumed from the forum id.
      const threads = await db.thread.findMany({
        where: { title: contains, forum: { category: { tenantId: actor.tenantId } } },
        include: { forum: { select: { name: true } } },
        take: PER_KIND,
        orderBy: { title: "asc" },
      });
      if (threads.length > 0) {
        groups.push({
          label: "Chủ đề diễn đàn",
          icon: "discussion",
          hits: threads.map((thread) => ({
            kind: "Chủ đề",
            title: thread.title,
            subtitle: `${thread.forum.name}${thread.locked ? " · đã khóa" : ""}`,
            href: `/discussion/threads/${thread.id}`,
          })),
        });
      }
    }

    // The member directory is administrative data, not public search results.
    if (can(actor, "members.manage")) {
      const members = await db.schoolMembership.findMany({
        where: {
          tenantId: actor.tenantId,
          OR: [{ schoolMemberCode: contains }, { user: { fullName: contains } }],
        },
        include: { user: { select: { fullName: true } } },
        take: PER_KIND,
        orderBy: { schoolMemberCode: "asc" },
      });
      if (members.length > 0) {
        groups.push({
          label: "Thành viên",
          icon: "adminMembers",
          hits: members.map((member) => ({
            kind: "Thành viên",
            title: member.user.fullName,
            subtitle: `${member.schoolMemberCode} · ${member.memberType} · ${member.membershipStatus}`,
            href: `/admin/members?q=${encodeURIComponent(member.schoolMemberCode)}`,
          })),
        });
      }
    }
  }

  const totalHits = groups.reduce((sum, group) => sum + group.hits.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tìm kiếm"
        description="Tìm phòng, lớp, câu lạc bộ, sự kiện và chủ đề diễn đàn. Kết quả luôn giới hạn trong phạm vi quyền của tài khoản bạn."
      />

      <SearchForm defaultValue={q} />

      {q.length === 0 ? (
        <EmptyState
          title="Nhập từ khóa để bắt đầu"
          description="Ví dụ: mã phòng “R05”, tên lớp “10A1”, tên CLB, hoặc tiêu đề một chủ đề diễn đàn."
          icon={<Icons.search className="h-6 w-6" />}
        />
      ) : q.length < 2 ? (
        <EmptyState
          title="Từ khóa quá ngắn"
          description="Hãy nhập ít nhất 2 ký tự để tìm kiếm."
          icon={<Icons.search className="h-6 w-6" />}
        />
      ) : totalHits === 0 ? (
        <EmptyState
          title={`Không tìm thấy kết quả cho “${q}”`}
          description="Kiểm tra lại chính tả, hoặc thử một từ khóa ngắn hơn."
          icon={<Icons.search className="h-6 w-6" />}
        />
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-[var(--muted)]" aria-live="polite">
            <span className="font-medium tabular-nums text-[var(--body)]">{totalHits}</span> kết quả
            cho “{q}”
          </p>
          {groups.map((group) => {
            const GroupIcon = Icons[group.icon];
            return (
              <section key={group.label} className="space-y-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                  <GroupIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
                  {group.label}
                  <Badge tone="neutral" size="sm">
                    {group.hits.length}
                  </Badge>
                </h2>
                <Card className="p-0">
                  <ul className="divide-y divide-[var(--hairline-soft)]">
                    {group.hits.map((hit, index) => (
                      <li key={`${hit.href}-${index}`}>
                        <Link
                          href={hit.href}
                          className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ink)]"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[var(--ink)]">
                              {hit.title}
                            </p>
                            <p className="truncate text-xs text-[var(--muted)]">{hit.subtitle}</p>
                          </div>
                          <Icons.arrowRight
                            className="h-4 w-4 shrink-0 text-[var(--muted)]"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
