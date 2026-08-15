import { currentActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/PageHeader";

export default async function ApprovalsPage() {
  const actor = await currentActor();
  if (!actor) return null;
  const items = await db.approval.findMany({ where: { tenantId: actor.tenantId } });
  const rooms = await db.roomRequest.findMany({
    where: { tenantId: actor.tenantId, status: "PENDING_APPROVAL" },
  });
  return (
    <div>
      <PageHeader
        title="Phê duyệt"
        description="AI đề xuất → rule kiểm → người duyệt → giao dịch ghi."
      />
      {items.length + rooms.length === 0 ? (
        <EmptyState title="Không có phiếu chờ" action="Yêu cầu phòng và đề xuất CLB sẽ vào đây." />
      ) : (
        <ul className="space-y-2 text-sm">
          {rooms.map((r) => (
            <li key={r.id}>
              Phòng {r.roomId} · {r.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
