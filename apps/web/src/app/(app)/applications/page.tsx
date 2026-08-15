import { can } from "@ed4u/domain";
import type { Actor } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import type { Prisma } from "@/generated/prisma/client";

/**
 * An application is visible to its student, to the teacher currently handling
 * it, and to a teacher being asked to take it over. SCHOOL_ADMIN holds
 * `application.review` for oversight and sees the tenant's caseload; nobody
 * else sees anyone else's applications.
 */
export function applicationScope(actor: Actor): Prisma.ApplicationWhereInput {
  const base = { tenantId: actor.tenantId };
  if (actor.roles.includes("SCHOOL_ADMIN") && can(actor, "application.review")) return base;
  return {
    ...base,
    OR: [
      { studentId: actor.userId },
      { currentTeacherId: actor.userId },
      { pendingTransferTo: actor.userId },
    ],
  };
}

export default async function ApplicationsPage() {
  const actor = await requireActor();
  const apps = await db.application.findMany({
    where: applicationScope(actor),
    include: { versions: true },
    orderBy: { updatedAt: "desc" },
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
