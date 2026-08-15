import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { isSoftHoldActive } from "@ed4u/domain";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { RoomApprovalActions } from "./RoomApprovalActions";

function formatTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function ApprovalsPage() {
  const actor = await requireRoute("/admin/approvals");
  const [tenant, items, rooms] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: actor.tenantId }, select: { timezone: true } }),
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
        description="AI đề xuất → phần mềm tái kiểm tra trạng thái trực tiếp → người có thẩm quyền quyết định → giao dịch khóa tài nguyên."
        badge={<Badge tone="brand">SCHOOL_ADMIN</Badge>}
      />

      {items.length + rooms.length === 0 ? (
        <EmptyState
          title="Không có phiếu chờ phê duyệt"
          description="Các yêu cầu đặt phòng, duyệt sự kiện và đề xuất thành lập CLB sẽ xuất hiện tại đây khi người dùng gửi yêu cầu."
        />
      ) : (
        <div className="space-y-4">
          {rooms.map((request) => {
            const holdActive = isSoftHoldActive(
              {
                requestId: request.id,
                roomId: request.roomId,
                startAt: request.eventStart,
                endAt: request.eventEnd,
                createdAt: request.holdCreatedAt,
              },
              new Date(),
            );
            const recommendation = request.recommendation as {
              selectedPlan?: { score?: number; pendingConflictRisk?: number };
              engineVersion?: string;
            } | null;
            return (
              <Card key={request.id} className="p-5" data-testid="room-approval-card">
                <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-[var(--ink)]">
                        {request.room.code} · {request.room.name}
                      </h2>
                      <StatusBadge status={request.status} />
                      <Badge tone={holdActive ? "warning" : "neutral"} size="sm">
                        {holdActive ? "Soft hold đang hoạt động" : "Soft hold đã hết hạn"}
                      </Badge>
                    </div>
                    <div className="grid gap-2 text-xs text-[var(--body)] sm:grid-cols-2">
                      <p>
                        <span className="text-[var(--muted)]">Thời gian:</span>{" "}
                        {formatTime(request.eventStart, tenant.timezone)} →{" "}
                        {formatTime(request.eventEnd, tenant.timezone)}
                      </p>
                      <p>
                        <span className="text-[var(--muted)]">Setup / cleanup:</span>{" "}
                        {request.setupMinutes} / {request.cleanupMinutes} phút
                      </p>
                      <p>
                        <span className="text-[var(--muted)]">Người gửi:</span>{" "}
                        {request.requestedBy}
                      </p>
                      <p>
                        <span className="text-[var(--muted)]">Mã phiếu:</span>{" "}
                        <span className="font-mono">{request.id.slice(0, 8)}…</span>
                      </p>
                    </div>
                    {request.purpose ? (
                      <p className="rounded-md bg-[var(--surface-soft)] p-3 text-xs text-[var(--body)]">
                        “{request.purpose}”
                      </p>
                    ) : null}
                    {recommendation?.selectedPlan ? (
                      <p className="text-[11px] text-[var(--muted)]">
                        Facility Engine {recommendation.engineVersion ?? ""} · điểm đề xuất{" "}
                        {recommendation.selectedPlan.score?.toFixed?.(1) ?? "—"} · rủi ro soft hold{" "}
                        {Math.round((recommendation.selectedPlan.pendingConflictRisk ?? 0) * 100)}%
                      </p>
                    ) : null}
                  </div>
                  <RoomApprovalActions requestId={request.id} />
                </div>
              </Card>
            );
          })}

          {items.map((item) => (
            <Card key={item.id} className="p-4 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-semibold text-sm text-[var(--ink)]">
                  Phiếu duyệt: {item.subjectType}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Mã phiếu: <span className="font-mono">{item.id.slice(0, 8)}…</span>
                </p>
              </div>
              <StatusBadge status={item.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
