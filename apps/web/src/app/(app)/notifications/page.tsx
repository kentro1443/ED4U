import { currentActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/PageHeader";

export default async function NotificationsPage() {
  const actor = await currentActor();
  if (!actor) return null;
  const items = await db.notification.findMany({
    where: { userId: actor.userId },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageHeader title="Thông báo" />
      {items.length === 0 ? (
        <EmptyState
          title="Hộp thư trống"
          action="Thông báo sẽ hiện khi có duyệt đơn, phòng, mentor hoặc diễn đàn."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className="rounded-lg border border-[var(--line)] bg-[var(--card)] p-3">
              <p className="font-medium">{n.title}</p>
              <p className="text-sm text-[var(--muted)]">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
