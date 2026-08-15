import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { PageHeader } from "@/components/PageHeader";

export default async function AuditPage() {
  const actor = await requireRoute("/admin/audit");
  const events = await db.auditEvent.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { timestamp: "desc" },
    take: 50,
  });
  return (
    <div>
      <PageHeader title="Nhật ký" />
      <ul className="space-y-1 text-sm">
        {events.map((e) => (
          <li key={e.id}>
            {e.timestamp.toISOString()} · {e.action} · {e.entityType}
          </li>
        ))}
      </ul>
    </div>
  );
}
