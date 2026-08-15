import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";

export default async function ApprovalsPage() {
  const actor = await requireRoute("/admin/approvals");
  const [items, rooms] = await Promise.all([
    db.approval.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { requestedAt: "desc" },
    }),
    db.roomRequest.findMany({
      where: { tenantId: actor.tenantId, status: "PENDING_APPROVAL" },
      include: { room: true },
      orderBy: { holdCreatedAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trung tâm phê duyệt"
        description="Quy trình vận hành: AI đề xuất → Phần mềm xác thực ràng buộc cứng → Người có thẩm quyền phê duyệt → Giao dịch ghi nhận trạng thái thực."
        badge={<Badge tone="brand">SCHOOL_ADMIN</Badge>}
      />

      {items.length + rooms.length === 0 ? (
        <EmptyState
          title="Không có phiếu chờ phê duyệt"
          description="Hàng đợi hiện tại đang trống. Các yêu cầu đặt phòng, duyệt sự kiện và đề xuất thành lập CLB sẽ xuất hiện tại đây khi người dùng gửi yêu cầu."
        />
      ) : (
        <div className="space-y-3">
          {rooms.map((r) => (
            <Card key={r.id} className="p-4 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-semibold text-sm text-[var(--ink)]">
                  Yêu cầu mượn phòng:{" "}
                  {r.room ? `${r.room.code} · ${r.room.name}` : `Phòng ${r.roomId}`}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Mã phiếu: <span className="font-mono">{r.id.slice(0, 8)}…</span> · Trạng thái:{" "}
                  {r.status}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </Card>
          ))}
          {items.map((it) => (
            <Card key={it.id} className="p-4 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-semibold text-sm text-[var(--ink)]">
                  Phiếu duyệt: {it.subjectType}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Mã phiếu: <span className="font-mono">{it.id.slice(0, 8)}…</span>
                </p>
              </div>
              <StatusBadge status={it.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
