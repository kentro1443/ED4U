import { currentActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/PageHeader";

export default async function EventsPage() {
  const actor = await currentActor();
  if (!actor) return null;
  const events = await db.schoolEvent.findMany({ where: { tenantId: actor.tenantId } });
  return (
    <div>
      <PageHeader
        title="Sự kiện trường"
        description="Hiển thị theo SCHOOL / GRADE / CLASS / CLUB / PRIVATE."
      />
      {events.length === 0 ? (
        <EmptyState title="Chưa có sự kiện" action="SCHOOL_ADMIN có thể tạo sự kiện mới." />
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
              <p className="font-medium">{e.title}</p>
              <p className="text-sm text-[var(--muted)]">{e.visibility}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
