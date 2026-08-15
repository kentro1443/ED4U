import { currentActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/PageHeader";

export default async function ApplicationsPage() {
  const actor = await currentActor();
  if (!actor) return null;
  const apps = await db.application.findMany({
    where: { tenantId: actor.tenantId },
    include: { versions: true },
    take: 20,
  });
  return (
    <div>
      <PageHeader
        title="Đơn xin"
        description="PDF theo phiên bản. File đã review không bị ghi đè."
      />
      {apps.length === 0 ? (
        <EmptyState title="Chưa có đơn" action="Tải mẫu PDF, điền rồi nộp phiên bản mới." />
      ) : (
        <ul className="space-y-3">
          {apps.map((a) => (
            <li key={a.id} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
              <p className="font-medium">{a.status}</p>
              <p className="text-sm">{a.rawRequestText}</p>
              <p className="text-xs text-[var(--muted)]">{a.versions.length} phiên bản nộp</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
